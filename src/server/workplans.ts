import { prisma } from "@/lib/prisma";
import { compileCriticalityModel, loadAssetValues, scoreAssets } from "@/server/criticality";
import { WorkPlanItemStatus } from "@prisma/client";
import {
  DEFAULT_WEIGHTS,
  normalizeWeights,
  scoreCandidates,
  explainPriority,
  OBJECTIVE_KEYS,
  type ObjectiveWeights,
  type ObjectiveValues,
} from "@/domain/waterline/optimization";
import {
  WATERLINE_TREATMENTS,
  enumerateOptions,
  splitOptionCost,
  type AssetTreatmentContext,
  type TreatmentOption,
} from "@/domain/waterline/treatment";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { buildLccaEvaluator } from "@/domain/waterline/lcca-evaluator";
import { curveFor } from "@/domain/waterline/deterioration";
import { effectiveAgeForCondition, evaluateCurve } from "@/domain/waterline/deterioration";
import { ageInYears } from "@/lib/format";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { loadCombinations } from "@/server/combinations";
import { getMaterialCurves } from "@/server/settings";
import { budgetLedger, UNCAPPED, type CategoryCaps } from "@/domain/waterline/category-weight";
import { clearsEffectivenessFloor } from "@/domain/waterline/treatment";

export type GenerateWorkPlanInput = {
  name: string;
  startYear: number;
  years: number;
  annualBudget: number;
  fundingGrowth: number;
  weights: ObjectiveWeights;
  /** Which named set the weights came from, for provenance. Null when they
   * came from the built-in defaults. */
  weightSetId?: string | null;
  /** The most of each year's budget each category may take. Defaulted to
   * uncapped, so a caller that does not pass one keeps today's behaviour. */
  caps?: CategoryCaps;
  categoryWeightSetId?: string | null;
  scenarioId?: string | null;
};

type CandidateInfo = {
  assetId: string;
  assetCode: string;
  option: TreatmentOption;
  cost: number;
  conditionNow: number;
  projectedCondition: number;
  riskNow: number;
  riskAfter: number;
  lccSavings: number;
  criticality: number;
  serviceArea: string | null;
  material: string | null;
  /** Kept so the cost can be split between a bundle's members at write time. */
  ctx: AssetTreatmentContext;
};

const TEN_YEARS_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;

/**
 * Criticality per asset for a scenario that names its own formula.
 *
 * Returns null when the scenario has no formula of its own, which leaves the
 * stored score in charge — the one the asset pages show — so a plan only
 * diverges from the rest of the system where that was asked for.
 */
async function criticalityForScenario(
  organizationId: string,
  scenarioId: string
): Promise<Map<string, number> | null> {
  const scenario = await prisma.scenario.findFirst({
    where: { id: scenarioId, organizationId },
    select: { criticalityModel: true },
  });
  const model = scenario?.criticalityModel;
  if (!model) return null;

  const compiled = await compileCriticalityModel(model.id);
  if (!compiled) return null;

  const values = await loadAssetValues(organizationId, model.assetTypeId, compiled.valueMaps);
  return new Map(scoreAssets(compiled.tree, values).map((s) => [s.assetId, s.score]));
}

/** Assemble every asset with a viable treatment, plus the objective values
 * the optimizer needs. Reuses the same applicability rules as Phase 5 so the
 * plan can never contain work the recommendation engine would reject. */
async function buildCandidates(
  organizationId: string,
  /** Criticality from the scenario's own formula, worked out live. Absent for a
   * plan with no scenario, or a scenario that follows the asset type's active
   * formula, in which case the last computed score is used. */
  scenarioCriticality?: Map<string, number> | null
): Promise<CandidateInfo[]> {
  const curves = await getMaterialCurves(organizationId);
  const since = new Date(Date.now() - TEN_YEARS_MS);
  const [library, combinations] = await Promise.all([
    loadTreatmentDefs(organizationId),
    loadCombinations(organizationId),
  ]);
  const assets = await prisma.asset.findMany({
    where: { organizationId, assetType: { code: "WATERLINE" }, deletedAt: null, status: "ACTIVE" },
    include: {
      attributeValues: { include: { definition: true } },
      conditionMeasurements: { orderBy: { measurementDate: "desc" }, take: 1 },
      riskAssessments: { orderBy: { assessmentDate: "desc" }, take: 1 },
      criticalityScores: { orderBy: { calculatedAt: "desc" }, take: 1 },
      failureEvents: { where: { failureDate: { gte: since } }, select: { id: true } },
      location: { select: { serviceArea: true, pressureZone: true } },
    },
  });

  const candidates: CandidateInfo[] = [];

  for (const asset of assets) {
    const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);
    const risk = asset.riskAssessments[0];
    const conditionScore = asset.conditionMeasurements[0]?.score ?? null;
    if (conditionScore == null) continue; // never plan capital work off unknown condition

    const diameterInches = attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null;
    const lengthFt = attr(WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? null;
    const customersServed = attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null;
    const pof = risk?.probabilityScore ?? 3;
    const cof = risk?.consequenceScore ?? 3;

    const ctx: AssetTreatmentContext = {
      conditionScore,
      material: attr(WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null,
      diameterInches,
      lengthFt,
      customersServed,
      pof,
      cof,
      riskScore: risk?.riskScore ?? pof * cof,
      failuresLast10Years: asset.failureEvents.length,
      ageYears: ageInYears(asset.installationDate),
      expectedUsefulLife: asset.expectedUsefulLife ?? 75,
      criticality: attr(WATERLINE_ATTRIBUTES.CRITICALITY)?.textValue ?? null,
      serviceArea: asset.location?.serviceArea ?? null,
      pressureZone: asset.location?.pressureZone ?? null,
    };

    // Every life-cycle comparison below is measured against a planned
    // Replacement. Without a rate that prices one for this asset there is no
    // baseline, so the asset yields no candidate at all rather than a set of
    // costs compared against nothing.
    const lcca = buildLccaEvaluator(
      ctx,
      conditionScore,
      library,
      curves,
      WATERLINE_TREATMENTS.find((d) => d.name === "Replacement")!
    );
    if (!lcca) continue;

    // Pick this asset's best option on life-cycle cost, then let the optimizer
    // decide which assets get funded first. An option is one treatment or a
    // configured bundle; the arithmetic that combines a bundle's members lives
    // in buildOption, so nothing here has to know which it is holding.
    let best: CandidateInfo | null = null;
    for (const option of enumerateOptions(ctx, library, combinations)) {
      if (option.category === "Assess" || option.category === "Retire") continue;

      const cost = option.cost;
      const projectedCondition = option.projectedCondition;
      const riskAfter = Math.max(1, pof * option.failureProbMultiplier) * cof;

      const info: CandidateInfo = {
        assetId: asset.id,
        assetCode: asset.assetCode,
        option,
        cost,
        conditionNow: conditionScore,
        projectedCondition,
        riskNow: Math.round(pof * cof * 10) / 10,
        riskAfter: Math.round(riskAfter * 10) / 10,
        lccSavings: lcca.savingFor(option),
        criticality:
          scenarioCriticality?.get(asset.id) ?? asset.criticalityScores[0]?.score ?? 50,
        serviceArea: asset.location?.serviceArea ?? null,
        material: ctx.material,
        ctx,
      };

      if (!best || info.lccSavings > best.lccSavings) best = info;
    }

    // Only plan work that is actually worth doing on life-cycle terms.
    if (best && best.lccSavings > 0) candidates.push(best);
  }

  return candidates;
}

function objectiveValues(c: CandidateInfo): ObjectiveValues {
  return {
    conditionImprovement: Math.max(0, c.projectedCondition - c.conditionNow),
    riskReduction: Math.max(0, c.riskNow - c.riskAfter),
    lifeCycleCost: Math.max(0, c.lccSavings),
    criticality: c.criticality,
  };
}

export async function generateWorkPlan(organizationId: string, input: GenerateWorkPlanInput) {
  const curves = await getMaterialCurves(organizationId);
  const weights = normalizeWeights(input.weights);

  // A scenario may name its own criticality formula, which is the whole point
  // of being able to ask "what if we prioritised hospitals instead". Worked
  // out live rather than read from the stored score, so choosing a formula
  // ranks the next plan without waiting for a model run.
  const scenarioCriticality = input.scenarioId
    ? await criticalityForScenario(organizationId, input.scenarioId)
    : null;

  const candidates = await buildCandidates(organizationId, scenarioCriticality);

  const scored = scoreCandidates(
    candidates.map((c) => ({ item: c, raw: objectiveValues(c) })),
    weights
  ).sort((a, b) => b.priorityScore - a.priorityScore);

  const workPlan = await prisma.workPlan.create({
    data: {
      name: input.name,
      startYear: input.startYear,
      endYear: input.startYear + input.years - 1,
      scenarioId: input.scenarioId ?? null,
      weightSetId: input.weightSetId ?? null,
      // Copied, not merely referenced. The set can be edited or deleted later
      // and this plan still has to explain its own ranking.
      objectiveWeights: input.weights as object,
    },
  });

  // Allocate down the priority list, year by year, under the annual budget.
  // Anything that does not fit rolls into the next year still ranked by
  // priority; whatever never fits is reported as backlog.
  const remaining = [...scored];
  const itemsToCreate: Array<{
    workPlanId: string;
    assetId: string;
    treatmentId: string;
    bundleId: string | null;
    bundleName: string | null;
    year: number;
    estimatedCost: number;
    expectedBenefit: object;
    reasonExplanation: string;
    fundingSource: string;
    status: WorkPlanItemStatus;
  }> = [];

  const treatmentRows = await prisma.treatment.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    select: { id: true, name: true },
  });
  const treatmentIdByName = new Map(treatmentRows.map((t) => [t.name, t.id]));

  const caps = input.caps ?? UNCAPPED;

  for (let i = 0; i < input.years; i++) {
    const year = input.startYear + i;
    const budget = input.annualBudget * Math.pow(1 + input.fundingGrowth, i);
    const ledger = budgetLedger(budget, caps);

    for (let idx = 0; idx < remaining.length; ) {
      const candidate = remaining[idx];
      const c = candidate.item;

      // The effectiveness floor, shared with the recommendation and with the
      // Priority Score ranking. A patch that leaves a failing main failing is
      // not funded whatever it scores per dollar; it stays in the backlog,
      // where a year with room for real work will find something better.
      const riskPct = c.riskNow > 0 ? ((c.riskNow - c.riskAfter) / c.riskNow) * 100 : null;
      if (!clearsEffectivenessFloor(c.conditionNow, riskPct)) {
        idx++;
        continue;
      }

      if (!ledger.canAfford(c.option.category, c.cost)) {
        idx++;
        continue;
      }
      // One row per treatment, so treatmentId stays a real foreign key and
      // every existing read path keeps working. A bundle becomes several rows
      // sharing a bundleId, which is what marks them as one decision.
      const treatmentIds = c.option.members.map((m) => treatmentIdByName.get(m.name));
      if (treatmentIds.some((id) => !id)) {
        idx++;
        continue;
      }

      ledger.commit(c.option.category, c.cost);
      // Condition at the time the work is actually scheduled, not today —
      // deferring a year means the asset is worse when the crew arrives.
      const curve = curveFor(c.material, curves);
      const deferredCondition =
        i === 0
          ? c.conditionNow
          : evaluateCurve(curve, effectiveAgeForCondition(curve, c.conditionNow) + i);

      // A bundle's cost divides between its members so the rows add up to the
      // option's total exactly; a single treatment gets the whole amount.
      const isBundle = c.option.members.length > 1;
      const shares = isBundle ? splitOptionCost(c.option, c.ctx) : [c.cost];
      const bundleId = isBundle ? `${workPlan.id}:${c.assetId}:${c.option.id}` : null;

      c.option.members.forEach((member, memberIndex) => {
      itemsToCreate.push({
        workPlanId: workPlan.id,
        assetId: c.assetId,
        treatmentId: treatmentIds[memberIndex]!,
        bundleId,
        bundleName: isBundle ? c.option.label : null,
        year,
        estimatedCost: shares[memberIndex],
        expectedBenefit: {
          conditionImprovement: Math.round((c.projectedCondition - c.conditionNow) * 10) / 10,
          riskReduction: Math.round((c.riskNow - c.riskAfter) * 10) / 10,
          riskReductionPct:
            c.riskNow > 0 ? Math.round(((c.riskNow - c.riskAfter) / c.riskNow) * 1000) / 10 : 0,
          lifeCycleSavings: Math.round(c.lccSavings),
          priorityScore: candidate.priorityScore,
          contributions: candidate.contributions,
          conditionAtScheduledYear: Math.round(deferredCondition * 10) / 10,
        },
        reasonExplanation: [
          explainPriority(candidate, weights),
          isBundle
            ? `Part of ${c.option.label}, applied together as ${c.option.members.map((m) => m.name).join(" + ")} at a combined $${c.cost.toLocaleString("en-US")}.`
            : "",
          `Condition ${c.conditionNow} → ${c.projectedCondition}.`,
          `Risk ${c.riskNow} → ${c.riskAfter}.`,
          `Life-cycle saving vs doing nothing: $${Math.round(c.lccSavings).toLocaleString("en-US")}.`,
        ]
          .filter(Boolean)
          .join(" "),
        fundingSource: "Capital Program",
        status: WorkPlanItemStatus.PLANNED,
      });
      });

      remaining.splice(idx, 1);
    }
  }

  if (itemsToCreate.length > 0) {
    await prisma.workPlanItem.createMany({ data: itemsToCreate });
  }

  return {
    workPlanId: workPlan.id,
    planned: itemsToCreate.length,
    backlogCount: remaining.length,
    backlogCost: Math.round(remaining.reduce((sum, r) => sum + r.item.cost, 0)),
  };
}

const workPlanItemInclude = {
  asset: {
    select: {
      id: true,
      assetCode: true,
      location: { select: { serviceArea: true } },
      conditionMeasurements: { orderBy: { measurementDate: "desc" as const }, take: 1, select: { score: true } },
      riskAssessments: { orderBy: { assessmentDate: "desc" as const }, take: 1, select: { riskScore: true } },
    },
  },
  treatment: { select: { id: true, name: true } },
};

export async function listWorkPlans() {
  const plans = await prisma.workPlan.findMany({
    include: { items: { select: { estimatedCost: true, year: true, status: true } }, scenario: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return plans.map((p) => ({
    id: p.id,
    name: p.name,
    startYear: p.startYear,
    endYear: p.endYear,
    scenarioName: p.scenario?.name ?? null,
    itemCount: p.items.length,
    totalCost: Math.round(p.items.reduce((s, i) => s + i.estimatedCost, 0)),
    createdAt: p.createdAt,
  }));
}

export type WorkPlanYear = {
  year: number;
  items: Array<{
    id: string;
    assetId: string;
    assetCode: string;
    serviceArea: string | null;
    treatment: string;
    estimatedCost: number;
    conditionNow: number | null;
    riskNow: number | null;
    priorityScore: number | null;
    riskReductionPct: number | null;
    reason: string | null;
    fundingSource: string | null;
    status: WorkPlanItemStatus;
  }>;
  totalCost: number;
};

export async function getWorkPlan(id: string) {
  const plan = await prisma.workPlan.findUnique({
    where: { id },
    include: { items: { include: workPlanItemInclude, orderBy: { estimatedCost: "desc" } }, scenario: true },
  });
  if (!plan) return null;

  const byYear = new Map<number, WorkPlanYear>();
  for (let y = plan.startYear; y <= plan.endYear; y++) {
    byYear.set(y, { year: y, items: [], totalCost: 0 });
  }

  for (const item of plan.items) {
    const benefit = (item.expectedBenefit ?? {}) as {
      priorityScore?: number;
      riskReductionPct?: number;
    };
    const entry = byYear.get(item.year) ?? { year: item.year, items: [], totalCost: 0 };
    entry.items.push({
      id: item.id,
      assetId: item.asset.id,
      assetCode: item.asset.assetCode,
      serviceArea: item.asset.location?.serviceArea ?? null,
      treatment: item.treatment.name,
      estimatedCost: item.estimatedCost,
      conditionNow: item.asset.conditionMeasurements[0]?.score ?? null,
      riskNow: item.asset.riskAssessments[0]?.riskScore ?? null,
      priorityScore: benefit.priorityScore ?? null,
      riskReductionPct: benefit.riskReductionPct ?? null,
      reason: item.reasonExplanation,
      fundingSource: item.fundingSource,
      status: item.status,
    });
    entry.totalCost += item.estimatedCost;
    byYear.set(item.year, entry);
  }

  for (const entry of byYear.values()) {
    entry.items.sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
    entry.totalCost = Math.round(entry.totalCost);
  }

  return {
    id: plan.id,
    name: plan.name,
    startYear: plan.startYear,
    endYear: plan.endYear,
    scenarioName: plan.scenario?.name ?? null,
    years: [...byYear.values()].sort((a, b) => a.year - b.year),
    totalCost: Math.round(plan.items.reduce((s, i) => s + i.estimatedCost, 0)),
    itemCount: plan.items.length,
  };
}

/** Move an item to a different year (SPEC §17). Year totals are recomputed on
 * read, so the caller sees the budget impact immediately. */
export async function moveWorkPlanItem(itemId: string, targetYear: number) {
  const item = await prisma.workPlanItem.findUnique({ where: { id: itemId }, include: { workPlan: true } });
  if (!item) throw new Error("Work plan item not found");
  if (targetYear < item.workPlan.startYear || targetYear > item.workPlan.endYear) {
    throw new Error(`Year must be between ${item.workPlan.startYear} and ${item.workPlan.endYear}`);
  }
  await prisma.workPlanItem.update({ where: { id: itemId }, data: { year: targetYear } });
  return item.workPlanId;
}

export async function updateWorkPlanItemStatus(itemId: string, status: WorkPlanItemStatus) {
  const item = await prisma.workPlanItem.update({ where: { id: itemId }, data: { status } });
  return item.workPlanId;
}

export async function deleteWorkPlan(id: string) {
  await prisma.workPlanItem.deleteMany({ where: { workPlanId: id } });
  await prisma.workPlan.delete({ where: { id } });
}

/** Idempotently create a baseline 5-year plan for the demo. */
export async function ensureBaselineWorkPlan(organizationId: string): Promise<boolean> {
  const existing = await prisma.workPlan.findFirst();
  if (existing) return false;

  const budget = await prisma.budget.findFirst({ where: { organizationId }, orderBy: { fiscalYear: "desc" } });
  await generateWorkPlan(organizationId, {
    name: "5-Year Capital Work Plan",
    startYear: new Date().getFullYear(),
    years: 5,
    annualBudget: budget?.amount ?? 4_000_000,
    fundingGrowth: 0.03,
    weights: DEFAULT_WEIGHTS,
  });
  return true;
}

export { OBJECTIVE_KEYS };
