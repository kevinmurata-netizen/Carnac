import { prisma } from "@/lib/prisma";
import { WorkPlanItemStatus } from "@prisma/client";
import { DEFAULT_WEIGHTS, type ObjectiveWeights } from "@/domain/waterline/optimization";
import {
  WATERLINE_TREATMENTS,
  clearsEffectivenessFloor,
  enumerateOptions,
  splitOptionCost,
  type AssetTreatmentContext,
} from "@/domain/waterline/treatment";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { buildLccaEvaluator } from "@/domain/waterline/lcca-evaluator";
import { curveFor } from "@/domain/waterline/deterioration";
import { effectiveAgeForCondition, evaluateCurve } from "@/domain/waterline/deterioration";
import { ageInYears } from "@/lib/format";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { loadCombinations } from "@/server/combinations";
import { getMaterialCurves } from "@/server/settings";
import { assetScaleFactors } from "@/server/scale-factors";
import { NEUTRAL_SCALE_FACTOR } from "@/domain/waterline/scale-factor";
import { computeCriticalityScore } from "@/domain/waterline/risk";
import {
  benefitCof,
  explainPriority,
  optionTerms,
  priorityScore,
  scoreBenefits,
  type BenefitTerms,
  type BenefitWeights,
} from "@/domain/waterline/benefit";
import {
  CATEGORY_KEYS,
  NEUTRAL_CATEGORY_WEIGHTS,
  UNCAPPED,
  categoryCap,
  categoryWeight,
  type CategoryCaps,
  type CategoryWeights,
} from "@/domain/waterline/category-weight";
import type { FundingPlan } from "@/domain/waterline/category-funding";
import { selectForYear, type Rankable } from "@/domain/waterline/selection";

/**
 * Generating a multi-year capital program (SPEC §17).
 *
 * The plan is a **static schedule**, and that is the one place it differs from
 * a scenario run. Options are enumerated and priced once, against the network
 * as it stands, and then the years are spent down; a scenario re-enumerates
 * every year from the condition its own earlier work produced. So a plan says
 * "here is the programme we would commit to now", and a scenario says "here is
 * how the network behaves if we keep deciding afresh".
 *
 * Everything else is deliberately the same as a scenario, and since
 * 2026-09-17 that includes how a year's work is chosen: every applicable
 * option on every segment is scored by the Priority Score (§5.4), and the year
 * buys the best next *step up* anywhere on the network by what it adds for
 * what it adds to the bill — `domain/waterline/selection.ts`, §5.7. A segment
 * receives at most one treatment across the whole plan, and work that does not
 * fit a year rolls forward to the next.
 *
 * **A plan generated from a scenario is not made here.** A scenario run already
 * materializes the projects it funded as a WorkPlan carrying its scenarioId —
 * see `persistScenarioProgram` in server/scenarios.ts — so the work plan a
 * scenario produces *is* the run's own selection, year for year, rather than a
 * re-derivation that could disagree with it. This function builds the plans
 * that belong to no scenario.
 */

export type GenerateWorkPlanInput = {
  name: string;
  startYear: number;
  years: number;
  annualBudget: number;
  fundingGrowth: number;
  /**
   * How much condition, risk reduction and life-cycle saving count toward
   * Expected Benefit. The set's fourth number, criticality, is deliberately
   * not one of them: it multiplies the benefit rather than forming part of it
   * (§5.3), exactly as it does for a scenario and for the network-wide
   * ranking.
   */
  weights: ObjectiveWeights;
  /** Which named set the weights came from, for provenance. Null when they
   * came from the built-in defaults. */
  weightSetId?: string | null;
  /** How far the plan leans toward each kind of work, as a multiplier on the
   * Priority Score. Defaulted to neutral. */
  categoryWeights?: CategoryWeights;
  /** The most of each year's budget each category may take. Defaulted to
   * uncapped, so a caller that does not pass one is limited only by the year's
   * budget. */
  caps?: CategoryCaps;
  categoryWeightSetId?: string | null;
};

/**
 * One option on one segment, scored — a rung on that segment's ladder.
 *
 * `assetId`, `option`, `cost`, `priority` and `value` are what the selection
 * engine reads; the rest is what the written row needs to explain itself.
 */
type CandidateInfo = Rankable & {
  assetCode: string;
  conditionNow: number;
  projectedCondition: number;
  riskNow: number;
  riskAfter: number;
  lccSavings: number;
  criticality: number;
  scaleFactor: number;
  categoryWeight: number;
  /** Expected Benefit, 0–100, normalized across every option on every segment. */
  benefit: number;
  terms: BenefitTerms;
  serviceArea: string | null;
  material: string | null;
  /** Kept so the cost can be split between a bundle's members at write time. */
  ctx: AssetTreatmentContext;
};

const TEN_YEARS_MS = 10 * 365.25 * 24 * 60 * 60 * 1000;

/**
 * Every option on every segment the plan could fund, scored.
 *
 * *Every* option, not the best one per segment. Picking one up front — which
 * this did, by life-cycle saving — meant the plan could only ever re-order a
 * set chosen by a different rule, and a combination that won eighty
 * recommendations reached the plan zero times. It also made the step-up
 * question unanswerable: comparing a patch against a relining on the same
 * segment needs both of them on the list.
 *
 * Options ruled out here, rather than at allocation time, because the
 * selection engine reads the set as a segment's alternatives: anything left in
 * that may not be bought would sit on the ladder as a rung nothing can climb.
 */
async function buildCandidates(
  organizationId: string,
  benefitWeights: BenefitWeights,
  categoryWeights: CategoryWeights
): Promise<CandidateInfo[]> {
  const since = new Date(Date.now() - TEN_YEARS_MS);
  const assetType = await prisma.assetType.findFirst({
    where: { organizationId, code: "WATERLINE" },
    select: { id: true },
  });
  const [curves, library, combinations, scale, treatmentRows] = await Promise.all([
    getMaterialCurves(organizationId),
    loadTreatmentDefs(organizationId),
    loadCombinations(organizationId),
    // Read once rather than per option: the formula is over length, diameter
    // and the like, none of which a treatment changes.
    assetType
      ? assetScaleFactors(organizationId, assetType.id)
      : Promise.resolve({ factors: new Map<string, { factor: number; missing: boolean }>(), name: null }),
    prisma.treatment.findMany({
      where: { assetType: { code: "WATERLINE", organizationId } },
      select: { name: true },
    }),
  ]);
  const writable = new Set(treatmentRows.map((t) => t.name));

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

  type Pending = Omit<CandidateInfo, "priority" | "value" | "benefit" | "terms">;
  const pending: Array<{ item: Pending; terms: BenefitTerms }> = [];

  for (const asset of assets) {
    const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);
    const risk = asset.riskAssessments[0];
    const conditionScore = asset.conditionMeasurements[0]?.score ?? null;
    if (conditionScore == null) continue; // never plan capital work off unknown condition

    const diameterInches = attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null;
    const lengthFt = attr(WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? null;
    const customersServed = attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null;
    const criticalityRating = attr(WATERLINE_ATTRIBUTES.CRITICALITY)?.textValue ?? null;
    const customerType = attr(WATERLINE_ATTRIBUTES.CUSTOMER_TYPE)?.textValue ?? null;
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
      criticality: criticalityRating,
      customerType,
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

    // The stored score, then the risk-based default — the same fallback the
    // network-wide ranking and the scenario engine use, so all three agree
    // about what a segment is worth.
    const criticality =
      asset.criticalityScores[0]?.score ??
      computeCriticalityScore({ customersServed, criticality: criticalityRating, diameterInches, customerType }).score;

    // Criticality-free consequence, so the multiplier is not also hiding
    // inside the risk term. §5.3.
    const cofNoCriticality = benefitCof({
      customersServed,
      criticality: criticalityRating,
      diameterInches,
      customerType,
    });

    const scaled = scale.factors.get(asset.id);
    const scaleFactor = scaled?.factor ?? NEUTRAL_SCALE_FACTOR;

    for (const option of enumerateOptions(ctx, library, combinations)) {
      // Assessment buys information rather than condition, and retirement is a
      // decision about service rather than a capital project. Neither belongs
      // in a budget-constrained programme.
      if (option.category === "Assess" || option.category === "Retire") continue;

      // A row names one treatment, so an option whose members have no
      // Treatment row could be selected and then not written — leaving the
      // year's budget committed to work that never appears in the plan.
      if (!option.members.every((m) => writable.has(m.name))) continue;

      const riskAfter = Math.max(1, pof * option.failureProbMultiplier) * cof;
      const riskNow = Math.round(pof * cof * 10) / 10;
      const riskPct = riskNow > 0 ? ((riskNow - riskAfter) / riskNow) * 100 : null;

      // The effectiveness floor, shared with the recommendation and with the
      // network-wide ranking. A patch that leaves a failing main failing is
      // not funded whatever it scores per dollar. §5.5.
      if (!clearsEffectivenessFloor(conditionScore, riskPct)) continue;

      pending.push({
        item: {
          assetId: asset.id,
          assetCode: asset.assetCode,
          option,
          cost: option.cost,
          conditionNow: conditionScore,
          projectedCondition: option.projectedCondition,
          riskNow,
          riskAfter: Math.round(riskAfter * 10) / 10,
          lccSavings: lcca.savingFor(option),
          criticality,
          scaleFactor,
          categoryWeight: categoryWeight(categoryWeights, option.category),
          serviceArea: asset.location?.serviceArea ?? null,
          material: ctx.material,
          ctx,
        },
        terms: optionTerms(option, ctx, cofNoCriticality, lcca.savingFor(option)),
      });
    }
  }

  // Normalized across every option on every segment, so two rows' benefit
  // scores mean the same thing — and, because a plan is static, so that one
  // score holds for the whole horizon rather than being re-scaled each year.
  return scoreBenefits(pending, benefitWeights).map<CandidateInfo>((s) => ({
    ...s.item,
    terms: s.raw,
    benefit: s.benefit,
    value: s.item.criticality * s.item.scaleFactor * s.item.categoryWeight * s.benefit,
    priority: priorityScore({
      criticality: s.item.criticality,
      scaleFactor: s.item.scaleFactor,
      categoryWeight: s.item.categoryWeight,
      benefit: s.benefit,
      totalCost: s.item.cost,
    }),
  }));
}

/**
 * Category caps as the selection engine's funding plan.
 *
 * The two say the same thing in different words — the most of one year's
 * budget a category may take — so this is a translation, not a policy. Every
 * category is listed, because an unlisted one may spend nothing while an
 * uncapped one may spend the lot.
 */
function fundingPlanFromCaps(caps: CategoryCaps): FundingPlan {
  return CATEGORY_KEYS.map((category) => ({ category, maxPct: categoryCap(caps, category) }));
}

export async function generateWorkPlan(organizationId: string, input: GenerateWorkPlanInput) {
  const curves = await getMaterialCurves(organizationId);
  const categoryWeights = input.categoryWeights ?? NEUTRAL_CATEGORY_WEIGHTS;
  const caps = input.caps ?? UNCAPPED;

  // Criticality is absent on purpose: it multiplies the benefit rather than
  // forming part of it. §5.3, and the same three lines as `rankOptions`.
  const benefitWeights: BenefitWeights = {
    conditionImprovement: input.weights.conditionImprovement,
    riskReduction: input.weights.riskReduction,
    lifeCycleSaving: input.weights.lifeCycleCost,
  };

  const candidates = await buildCandidates(organizationId, benefitWeights, categoryWeights);
  // Sorted by Priority Score only so ties in the selection resolve toward the
  // higher-priority segment; what is bought is decided in ./selection.ts.
  candidates.sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1));

  const workPlan = await prisma.workPlan.create({
    data: {
      name: input.name,
      startYear: input.startYear,
      endYear: input.startYear + input.years - 1,
      weightSetId: input.weightSetId ?? null,
      // Copied, not merely referenced. The set can be edited or deleted later
      // and this plan still has to explain its own ranking.
      objectiveWeights: input.weights as object,
      categoryWeightSetId: input.categoryWeightSetId ?? null,
      categoryWeights: { weights: categoryWeights, caps } as object,
    },
  });

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

  const plan = fundingPlanFromCaps(caps);

  // Year by year under that year's budget. A segment funded in one year leaves
  // the pool entirely — a static plan has no closed loop that would make
  // treating the same segment twice mean anything — and everything else rolls
  // forward, so whatever never fits is the backlog.
  let remaining = candidates;
  for (let i = 0; i < input.years; i++) {
    const year = input.startYear + i;
    const budget = input.annualBudget * Math.pow(1 + input.fundingGrowth, i);
    const outcome = selectForYear(remaining, budget, plan);

    for (const c of outcome.selected) {
      // One row per treatment, so treatmentId stays a real foreign key and
      // every existing read path keeps working. A bundle becomes several rows
      // sharing a bundleId, which is what marks them as one decision.
      const treatmentIds = c.option.members.map((m) => treatmentIdByName.get(m.name)!);

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

      const step = outcome.incremental.get(c);
      const terms = {
        criticality: c.criticality,
        scaleFactor: c.scaleFactor,
        categoryWeight: c.categoryWeight,
        benefit: c.benefit,
        totalCost: c.cost,
      };

      c.option.members.forEach((_member, memberIndex) => {
        itemsToCreate.push({
          workPlanId: workPlan.id,
          assetId: c.assetId,
          treatmentId: treatmentIds[memberIndex],
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
            priorityScore: c.priority,
            expectedBenefitScore: c.benefit,
            criticality: Math.round(c.criticality * 10) / 10,
            scaleFactor: Math.round(c.scaleFactor * 100) / 100,
            categoryWeight: c.categoryWeight,
            incremental: step?.score ?? null,
            incrementalOver: step?.over?.option.label ?? null,
            conditionAtScheduledYear: Math.round(deferredCondition * 10) / 10,
          },
          reasonExplanation: [
            explainPriority(terms, c.priority),
            step
              ? step.over
                ? `Chosen over ${step.over.option.label}: ${step.score} more weighted benefit per dollar of the extra it costs.`
                : "The first step worth taking on this segment, measured against doing nothing."
              : "",
            isBundle
              ? `Part of ${c.option.label}, applied together as ${c.option.members.map((m) => m.name).join(" + ")} at a combined $${Math.round(c.cost).toLocaleString("en-US")}.`
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
    }

    const funded = new Set(outcome.selected.map((c) => c.assetId));
    remaining = remaining.filter((c) => !funded.has(c.assetId));
  }

  if (itemsToCreate.length > 0) {
    await prisma.workPlanItem.createMany({ data: itemsToCreate });
  }

  // Backlog is one figure per segment, not one per option: the highest-scoring
  // thing still wanted there. Counting every option would report the same
  // segment several times over and inflate the cost by whatever the library
  // happens to offer. `remaining` is already in Priority Score order.
  const backlog = new Map<string, number>();
  for (const c of remaining) if (!backlog.has(c.assetId)) backlog.set(c.assetId, c.cost);

  return {
    workPlanId: workPlan.id,
    planned: itemsToCreate.length,
    backlogCount: backlog.size,
    backlogCost: Math.round([...backlog.values()].reduce((sum, cost) => sum + cost, 0)),
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
