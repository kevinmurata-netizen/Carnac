import { prisma } from "@/lib/prisma";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import {
  WATERLINE_TREATMENTS,
  rulesFromWindow,
  recommendTreatment,
  enumerateOptions,
  type AssetTreatmentContext,
  type Recommendation,
} from "@/domain/waterline/treatment";
import {
  benefitCof,
  costPerUnit,
  rankingValue,
  scoreBenefits,
  type BenefitTerms,
  type BenefitWeights,
  type CostBasis,
} from "@/domain/waterline/benefit";
import { computeCriticalityScore } from "@/domain/waterline/risk";
import { emptyRuleGroup, newRuleRef } from "@/domain/waterline/decision-tree";
import { ageInYears } from "@/lib/format";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { parseRules } from "@/server/rules";
import { createStandardRate } from "@/server/cost-rates";
import { loadCombinations } from "@/server/combinations";
import { buildLccaEvaluator } from "@/server/lcca-evaluator";
import { getMaterialCurves } from "@/server/settings";
import { resolveWeights } from "@/server/weight-sets";

/**
 * Idempotently write the treatment library, and the rules that decide what
 * each treatment is considered for.
 *
 * The rules matter as much as the treatments now. Seeding a treatment without
 * them would leave it ungated — considered for every inspected asset — which
 * is the opposite of the condition window it was written with. `rulesFromWindow`
 * is the same conversion the Phase 1 migration performs in SQL for databases
 * that already hold treatments; this is the other half, for a fresh one. The
 * two produce identical names on purpose, so a seeded database and a migrated
 * one agree about which assets qualify.
 */
export async function ensureTreatments(organizationId: string) {
  const assetType = await prisma.assetType.findFirst({ where: { code: "WATERLINE", organizationId } });
  if (!assetType) throw new Error("WATERLINE asset type not found");

  for (const def of WATERLINE_TREATMENTS) {
    const existing = await prisma.treatment.findFirst({ where: { assetTypeId: assetType.id, name: def.name } });
    if (existing) continue;

    const created = await prisma.treatment.create({
      data: {
        assetTypeId: assetType.id,
        name: def.name,
        description: def.description,
        applicability: {
          category: def.category,
          constraints: def.implementationConstraints ?? null,
          // Record which kind of condition effect this is; effectOnCondition
          // below is a single number and cannot express the difference.
          conditionResetTo: def.conditionResetTo ?? null,
          conditionGain: def.conditionGain ?? null,
        },
        expectedLifeExtension: def.expectedLifeExtension,
        effectOnCondition: def.conditionResetTo ?? def.conditionGain ?? 0,
        effectOnFailureProb: def.failureProbMultiplier,
        usefulLife: def.usefulLife,
      },
      select: { id: true },
    });

    // A treatment with no rate cannot be priced and so is never recommended.
    // Seeded with the single fallback its own columns amount to.
    await createStandardRate(created.id, {
      unitCost: def.unitCost,
      costUnit: def.costUnit,
      mobilizationCost: def.mobilizationCost,
      annualMaintenanceCost: def.annualMaintenanceCost,
    });

    // Shared by name, so "Condition 0-45" is one row linked to Replacement and
    // Upsizing rather than a copy inside each — which is the whole point of
    // rules being organization-owned.
    const allowIds: string[] = [];
    for (const rule of rulesFromWindow(def)) {
      const row = await prisma.rule.upsert({
        where: { organizationId_name: { organizationId, name: rule.name } },
        update: {},
        create: {
          organizationId,
          name: rule.name,
          description: rule.description ?? null,
          effect: rule.effect,
          enabled: rule.enabled,
          definition: rule.root as object,
          isGenerated: true,
        },
        select: { id: true },
      });
      await prisma.treatmentRuleLink.create({ data: { treatmentId: created.id, ruleId: row.id } });
      if (rule.effect === "allow") allowIds.push(row.id);
    }

    // Write the arrangement rather than leaving it to be synthesised. A window
    // converts to "all of these must hold", which is what the tree says — and
    // storing it means a freshly seeded database never depends on the
    // qualifyMode fallback that Phase 6 removes. Blocks stay out of the tree;
    // they apply regardless of how the allow rules combine.
    const tree = emptyRuleGroup("AND");
    tree.children = allowIds.map((ruleId) => newRuleRef(ruleId));
    await prisma.treatment.update({ where: { id: created.id }, data: { ruleTree: tree as object } });
  }
}

/**
 * The library, as the Treatment Planning page shows it.
 *
 * Reads the current model throughout: what gates a treatment comes from its
 * attached rules, and what it costs comes from its rate rows. The condition
 * window and the treatment's own cost columns are no longer consulted — see
 * docs/TREATMENT-MODEL-REBUILD.md §6.
 *
 * There is no rule-derived equivalent of the old "condition range" and it
 * would be dishonest to invent one: a treatment gated by "Condition 20-55"
 * *and* "Diameter at least 6" cannot be reduced to a range. The rules are
 * named instead, which is both accurate and more informative.
 */
export async function listTreatments(organizationId: string) {
  const treatments = await prisma.treatment.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: {
      ruleLinks: { include: { rule: true } },
      costRates: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  return treatments.map((t) => {
    const parsed = parseRules(t.ruleLinks.map((l) => l.rule));
    const allows = parsed.filter((r) => r.effect === "allow");
    const blocks = parsed.filter((r) => r.effect === "block");

    // Rates are tried in order and the last one matches everything, so the
    // fallback is what an asset costs when no narrower rate claims it.
    const fallback = t.costRates.find((r) => r.ruleId == null) ?? t.costRates[t.costRates.length - 1];

    return {
      id: t.id,
      name: t.name,
      description: t.description,
      category: String((t.applicability as { category?: string } | null)?.category ?? "—"),
      appliesWhen: allows.length > 0 ? allows.map((r) => r.name).join(" · ") : "Every inspected asset",
      blockCount: blocks.length,
      unitCost: fallback?.unitCost ?? 0,
      costUnit: fallback?.costUnit ?? "",
      mobilizationCost: fallback?.mobilizationCost ?? 0,
      /** More than one means the headline price is only the fallback. */
      rateCount: t.costRates.length,
      expectedLifeExtension: t.expectedLifeExtension ?? 0,
      failureProbMultiplier: t.effectOnFailureProb ?? 1,
      constraints: (t.applicability as { constraints?: string | null } | null)?.constraints ?? null,
    };
  });
}

const TEN_YEARS_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;

/** Assemble the live inputs a recommendation needs: condition, risk,
 * attributes and failure history — all read fresh so a new inspection or
 * failure immediately changes what the system recommends. */
export async function buildContexts(organizationId: string, assetId?: string) {
  const since = new Date(Date.now() - TEN_YEARS_MS);
  const assets = await prisma.asset.findMany({
    where: {
      organizationId,
      assetType: { code: "WATERLINE" },
      deletedAt: null,
      ...(assetId ? { id: assetId } : { status: "ACTIVE" }),
    },
    include: {
      attributeValues: { include: { definition: true } },
      conditionMeasurements: { orderBy: { measurementDate: "desc" }, take: 1 },
      riskAssessments: { orderBy: { assessmentDate: "desc" }, take: 1 },
      failureEvents: { where: { failureDate: { gte: since } }, select: { id: true } },
      location: { select: { serviceArea: true, pressureZone: true } },
      // The multiplier in the ranking formula. Present only where a formula
      // has been run; the risk-based default fills in otherwise.
      criticalityScores: { orderBy: { calculatedAt: "desc" }, take: 1, select: { score: true } },
    },
  });

  return assets.map((asset) => {
    const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);
    const risk = asset.riskAssessments[0];
    const ctx: AssetTreatmentContext = {
      conditionScore: asset.conditionMeasurements[0]?.score ?? null,
      material: attr(WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null,
      diameterInches: attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null,
      lengthFt: attr(WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? null,
      customersServed: attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null,
      pof: risk?.probabilityScore ?? null,
      cof: risk?.consequenceScore ?? null,
      riskScore: risk?.riskScore ?? null,
      failuresLast10Years: asset.failureEvents.length,
      ageYears: ageInYears(asset.installationDate),
      expectedUsefulLife: asset.expectedUsefulLife ?? 75,
      criticality: attr(WATERLINE_ATTRIBUTES.CRITICALITY)?.textValue ?? null,
      customerType: attr(WATERLINE_ATTRIBUTES.CUSTOMER_TYPE)?.textValue ?? null,
      serviceArea: asset.location?.serviceArea ?? null,
      pressureZone: asset.location?.pressureZone ?? null,
    };
    return {
      asset: {
        id: asset.id,
        assetCode: asset.assetCode,
        storedCriticality: asset.criticalityScores[0]?.score ?? null,
      },
      ctx,
    };
  });
}

export async function getRecommendationForAsset(
  organizationId: string,
  assetId: string
): Promise<Recommendation | null> {
  const contexts = await buildContexts(organizationId, assetId);
  if (contexts.length === 0) return null;
  const [library, combinations] = await Promise.all([
    loadTreatmentDefs(organizationId),
    loadCombinations(organizationId),
  ]);
  return recommendTreatment(contexts[0].ctx, library, combinations);
}

export type NetworkRecommendationRow = {
  assetId: string;
  assetCode: string;
  conditionScore: number | null;
  riskScore: number | null;
  treatment: string;
  category: string;
  estimatedCost: number;
  riskReductionPct: number | null;
  /** What the treatment achieves, 0–100, normalized across every
   * recommendation in this run. See docs/TREATMENT-MODEL-REBUILD.md §5.3. */
  expectedBenefit: number;
  /** The three terms behind it, so the score can be read rather than trusted. */
  benefitTerms: BenefitTerms;
  /** What the asset is worth, 0–100 — the active formula's score, or the
   * risk-based default. */
  criticalityScore: number;
  /** Criticality × Benefit ÷ Cost per Unit. Null when the cost is zero. */
  value: number | null;
  costPerUnit: number;
  costBasis: CostBasis;
};

export type NetworkRecommendations = {
  rows: NetworkRecommendationRow[];
  totalEstimatedCost: number;
  byTreatment: Array<{ treatment: string; count: number; cost: number }>;
  noActionCount: number;
};

export async function getNetworkRecommendations(organizationId: string): Promise<NetworkRecommendations> {
  const contexts = await buildContexts(organizationId);
  const [library, combinations, curves, chosen] = await Promise.all([
    loadTreatmentDefs(organizationId),
    loadCombinations(organizationId),
    getMaterialCurves(organizationId),
    resolveWeights(organizationId),
  ]);

  // Criticality is deliberately absent from these weights: it multiplies the
  // benefit rather than forming part of it. §5.3.
  const benefitWeights: BenefitWeights = {
    conditionImprovement: chosen.weights.conditionImprovement,
    riskReduction: chosen.weights.riskReduction,
    lifeCycleSaving: chosen.weights.lifeCycleCost,
  };

  const fallbackReplacement = WATERLINE_TREATMENTS.find((d) => d.name === "Replacement")!;

  type Pending = {
    assetId: string;
    assetCode: string;
    conditionScore: number | null;
    riskScore: number | null;
    treatment: string;
    category: string;
    estimatedCost: number;
    riskReductionPct: number | null;
    criticalityScore: number;
    lengthFt: number | null;
  };

  const pending: Array<{ item: Pending; terms: BenefitTerms }> = [];
  let noActionCount = 0;

  for (const { asset, ctx } of contexts) {
    const rec = recommendTreatment(ctx, library, combinations);
    if (!rec.recommended) {
      noActionCount++;
      continue;
    }

    // Criticality-free consequence, so the multiplier below is not also
    // hiding inside the risk term.
    const cofNoCriticality = benefitCof({
      customersServed: ctx.customersServed,
      criticality: ctx.criticality ?? null,
      diameterInches: ctx.diameterInches,
      customerType: ctx.customerType ?? null,
    });

    const option = enumerateOptions(ctx, library, combinations).find(
      (o) => o.label === rec.recommended!.name
    );

    const conditionNow = ctx.conditionScore ?? 0;
    const conditionImprovement = option
      ? Math.max(0, option.projectedCondition - conditionNow)
      : Math.max(0, (rec.recommended.projectedCondition ?? conditionNow) - conditionNow);

    // Risk points removed, recomputed against the criticality-free consequence
    // rather than read off the stored risk score.
    const pof = ctx.pof ?? 0;
    const riskNow = pof * cofNoCriticality;
    const riskAfter = option ? Math.max(1, pof * option.failureProbMultiplier) * cofNoCriticality : riskNow;
    const riskReduction = Math.max(0, riskNow - (option?.failureProbMultiplier === 0 ? 0 : riskAfter));

    const lcca =
      ctx.conditionScore != null
        ? buildLccaEvaluator(ctx, ctx.conditionScore, library, curves, fallbackReplacement)
        : null;
    const lifeCycleSaving = lcca && option ? Math.max(0, lcca.savingFor(option)) : 0;

    pending.push({
      item: {
        assetId: asset.id,
        assetCode: asset.assetCode,
        conditionScore: ctx.conditionScore,
        riskScore: ctx.riskScore,
        treatment: rec.recommended.name,
        category: rec.recommended.category,
        estimatedCost: rec.recommended.estimatedCost,
        riskReductionPct: rec.recommended.riskReductionPct,
        criticalityScore:
          asset.storedCriticality ??
          computeCriticalityScore({
            customersServed: ctx.customersServed,
            criticality: ctx.criticality ?? null,
            diameterInches: ctx.diameterInches,
            customerType: ctx.customerType ?? null,
          }).score,
        lengthFt: ctx.lengthFt,
      },
      terms: { conditionImprovement, riskReduction, lifeCycleSaving },
    });
  }

  // Normalized across every recommendation in this run, so two assets' scores
  // mean the same thing. §5.3.
  const rows: NetworkRecommendationRow[] = scoreBenefits(pending, benefitWeights).map((s) => {
    const unit = costPerUnit(s.item.estimatedCost, s.item.lengthFt);
    return {
      assetId: s.item.assetId,
      assetCode: s.item.assetCode,
      conditionScore: s.item.conditionScore,
      riskScore: s.item.riskScore,
      treatment: s.item.treatment,
      category: s.item.category,
      estimatedCost: s.item.estimatedCost,
      riskReductionPct: s.item.riskReductionPct,
      expectedBenefit: s.benefit,
      benefitTerms: s.raw,
      criticalityScore: Math.round(s.item.criticalityScore * 10) / 10,
      value: rankingValue(s.item.criticalityScore, s.benefit, unit.value),
      costPerUnit: unit.value,
      costBasis: unit.basis,
    };
  });

  const byTreatmentMap = new Map<string, { count: number; cost: number }>();
  let totalEstimatedCost = 0;
  for (const row of rows) {
    totalEstimatedCost += row.estimatedCost;
    const entry = byTreatmentMap.get(row.treatment) ?? { count: 0, cost: 0 };
    entry.count += 1;
    entry.cost += row.estimatedCost;
    byTreatmentMap.set(row.treatment, entry);
  }

  return {
    rows: rows.sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)),
    totalEstimatedCost,
    byTreatment: [...byTreatmentMap.entries()]
      .map(([treatment, v]) => ({ treatment, ...v }))
      .sort((a, b) => b.cost - a.cost),
    noActionCount,
  };
}
