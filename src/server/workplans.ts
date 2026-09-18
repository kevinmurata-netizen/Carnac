import { prisma } from "@/lib/prisma";
import { WorkPlanItemStatus } from "@prisma/client";
import { DEFAULT_WEIGHTS, type ObjectiveWeights } from "@/domain/waterline/optimization";
import {
  WATERLINE_TREATMENTS,
  buildOption,
  clearsEffectivenessFloor,
  enumerateOptions,
  explainApplicability,
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
import { runScenario, DEFAULT_ASSUMPTIONS, type ScenarioAssumptions } from "@/domain/waterline/scenario";
import { runSchedule, type ScheduledVisit } from "@/domain/waterline/schedule";
import {
  loadScenarioRun,
  buildSimAssets,
  getAnnualBudget,
  getScenarioAssumptions,
} from "@/server/scenarios";

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

/**
 * A work plan made from a scenario: the run's own funded work, year for year,
 * as a plan you can then change.
 *
 * Nothing is re-derived. The scenario decides what is worth doing and when;
 * this copies that decision into rows that can be moved between years, and
 * records the budget it was planned against so a year can be shown as over or
 * under once work has been moved. The run's own mirror plan (see
 * `persistScenarioProgram`) is replaced every time the scenario runs; this one
 * is not, which is what makes it safe to edit.
 */
export async function createWorkPlanFromScenario(
  organizationId: string,
  scenarioId: string,
  name?: string
): Promise<{ workPlanId: string; planned: number; years: number }> {
  const run = await loadScenarioRun(organizationId, scenarioId);
  if (!run) throw new Error("That scenario no longer exists");

  const result = runScenario(run.simAssets, run.assumptions, run.options);
  const years = result.years.filter((y) => y.selected.length > 0);
  if (years.length === 0) {
    throw new Error(`${run.name} funds no work, so there is nothing to plan. Check its budget and what it considers.`);
  }

  const scenario = await prisma.scenario.findFirst({
    where: { id: scenarioId, organizationId },
    select: { weightSetId: true, categoryWeightSetId: true, categoryFundingPlanId: true },
  });

  const treatmentRows = await prisma.treatment.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    select: { id: true, name: true },
  });
  const treatmentIdByName = new Map(treatmentRows.map((t) => [t.name, t.id]));

  const workPlan = await prisma.workPlan.create({
    data: {
      scenarioId,
      name: name?.trim() || `${run.name} — Work Plan`,
      startYear: years[0].year,
      endYear: years[years.length - 1].year,
      isScenarioMirror: false,
      annualBudget: run.assumptions.annualBudget,
      fundingGrowth: run.assumptions.fundingGrowth,
      weightSetId: scenario?.weightSetId ?? null,
      categoryWeightSetId: scenario?.categoryWeightSetId ?? null,
      categoryFundingPlanId: scenario?.categoryFundingPlanId ?? null,
    },
  });

  // One row per treatment, so a funded bundle becomes several rows sharing a
  // bundleId: one visit, one set of effects, the cost divided between them.
  const items = years.flatMap((year) =>
    year.selected.flatMap((p) => {
      const isBundle = p.bundleName != null;
      const bundleId = isBundle ? `${workPlan.id}:${p.assetId}:${year.year}:${p.treatment}` : null;
      return p.members.flatMap((member) => {
        const treatmentId = treatmentIdByName.get(member.treatment);
        if (!treatmentId) return [];
        return [
          {
            workPlanId: workPlan.id,
            assetId: p.assetId,
            treatmentId,
            bundleId,
            bundleName: p.bundleName,
            year: year.year,
            estimatedCost: member.cost,
            expectedBenefit: {
              conditionBefore: p.conditionBefore,
              conditionAfter: p.conditionAfter,
              riskBefore: p.riskBefore,
              riskAfter: p.riskAfter,
              riskReductionPct:
                p.riskBefore > 0 ? Math.round(((p.riskBefore - p.riskAfter) / p.riskBefore) * 1000) / 10 : 0,
              priorityScore: p.priority,
              incremental: p.incremental,
              incrementalOver: p.incrementalOver,
              criticality: p.criticality,
              scaleFactor: p.scaleFactor,
              expectedBenefitScore: p.benefit,
            },
            reasonExplanation: [
              `Funded by the ${run.name} run in ${year.year}${isBundle ? ` as part of ${p.treatment}` : ""}.`,
              p.incremental != null
                ? p.incrementalOver
                  ? `Chosen over ${p.incrementalOver}: ${p.incremental} more weighted benefit per dollar of the extra it costs.`
                  : `The first step worth taking on this segment, at ${p.incremental} per dollar.`
                : "",
              `Condition ${p.conditionBefore} → ${p.conditionAfter}, risk ${p.riskBefore} → ${p.riskAfter}.`,
            ]
              .filter(Boolean)
              .join(" "),
            fundingSource: "Scenario Budget",
            status: WorkPlanItemStatus.PLANNED,
          },
        ];
      });
    })
  );

  if (items.length > 0) await prisma.workPlanItem.createMany({ data: items });
  return { workPlanId: workPlan.id, planned: items.length, years: years.length };
}

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
    /** A run's own record, rewritten whenever the scenario runs again. Not a
     * plan to edit — the page says so. */
    isScenarioMirror: p.isScenarioMirror,
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
    /** Put here by someone rather than chosen by the model. */
    addedByHand: boolean;
    /** Added although the treatment's rules refuse it on this segment — a
     * committed job the library would not have proposed. */
    forcedAgainstRules: boolean;
    /** The rule that refuses it, when one does. */
    refusedBy: string | null;
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
      addedByHand?: boolean;
      forcedAgainstRules?: boolean;
      refusedBy?: string | null;
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
      /** Put here by someone rather than chosen by the model. */
      addedByHand: benefit.addedByHand === true,
      /** Added although the treatment's rules refuse it on this segment. */
      forcedAgainstRules: benefit.forcedAgainstRules === true,
      refusedBy: benefit.refusedBy ?? null,
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
    scenarioId: plan.scenarioId,
    /** A run's own record, replaced whenever that scenario runs again. */
    isScenarioMirror: plan.isScenarioMirror,
    /** The money the plan was built against, when it holds it. */
    annualBudget: plan.annualBudget,
    fundingGrowth: plan.fundingGrowth,
    years: [...byYear.values()].sort((a, b) => a.year - b.year),
    totalCost: Math.round(plan.items.reduce((s, i) => s + i.estimatedCost, 0)),
    itemCount: plan.items.length,
  };
}

/**
 * Run a plan as it now stands: what this schedule does to the network.
 *
 * Nothing is chosen here — the plan already says what happens and when, and
 * this reports the consequences, which is what makes moving work between years
 * answerable. Rows sharing a bundleId are one visit, so a bundle mobilizes
 * once, exactly as the scenario that funded it did.
 *
 * Budgets come from the plan itself where it has them (a plan made from a
 * scenario freezes the money it was planned against); otherwise from the
 * organization's current budget, so an older plan still reports against
 * something honest.
 *
 * Where the plan came from a scenario, that scenario's own stored results are
 * returned beside it, so "what did my edits cost" is a comparison rather than
 * a number without a reference.
 */
export async function runWorkPlan(organizationId: string, workPlanId: string) {
  const plan = await prisma.workPlan.findUnique({
    where: { id: workPlanId },
    include: {
      items: { select: { assetId: true, year: true, estimatedCost: true, bundleId: true, treatment: { select: { name: true } } } },
      scenario: { select: { id: true, name: true } },
    },
  });
  if (!plan) return null;

  // One visit per segment per year, with rows that share a bundleId folded
  // back into the single job they were split from.
  const visits = new Map<string, ScheduledVisit>();
  for (const item of plan.items) {
    const key = item.bundleId ?? `${item.year}:${item.assetId}:${item.treatment.name}`;
    const visit = visits.get(key) ?? { year: item.year, assetId: item.assetId, treatments: [], cost: 0 };
    visit.treatments.push(item.treatment.name);
    visit.cost += item.estimatedCost;
    visits.set(key, visit);
  }

  const [simAssets, library, orgBudget, scenarioAssumptions] = await Promise.all([
    buildSimAssets(organizationId),
    loadTreatmentDefs(organizationId),
    getAnnualBudget(organizationId),
    plan.scenario ? getScenarioAssumptions(organizationId, plan.scenario.id) : Promise.resolve(null),
  ]);

  const assumptions: ScenarioAssumptions = {
    ...(scenarioAssumptions ?? DEFAULT_ASSUMPTIONS),
    annualBudget: plan.annualBudget ?? scenarioAssumptions?.annualBudget ?? orgBudget ?? DEFAULT_ASSUMPTIONS.annualBudget,
    fundingGrowth: plan.fundingGrowth ?? scenarioAssumptions?.fundingGrowth ?? DEFAULT_ASSUMPTIONS.fundingGrowth,
    analysisPeriodYears: plan.endYear - plan.startYear + 1,
  };

  const result = runSchedule(simAssets, assumptions, [...visits.values()], {
    library,
    startYear: plan.startYear,
    years: plan.endYear - plan.startYear + 1,
  });

  // The scenario's own figures, as Scenario Planning shows them, for the
  // comparison. Read rather than re-run: this is what the scenario says.
  const stored = plan.scenario
    ? await prisma.scenarioResult.findMany({
        where: { scenarioId: plan.scenario.id },
        select: { year: true, metricKey: true, metricValue: true },
      })
    : [];
  const scenarioByYear = new Map<number, Record<string, number>>();
  for (const row of stored) {
    scenarioByYear.set(row.year, { ...(scenarioByYear.get(row.year) ?? {}), [row.metricKey]: row.metricValue });
  }
  const scenarioYears = [...scenarioByYear.entries()].sort((a, b) => a[0] - b[0]);

  return {
    plan: { id: plan.id, name: plan.name, scenarioName: plan.scenario?.name ?? null },
    result,
    scenario:
      scenarioYears.length > 0
        ? {
            name: plan.scenario!.name,
            finalAvgCondition: scenarioYears[scenarioYears.length - 1][1].avgCondition ?? null,
            totalSpend: scenarioYears.reduce((sum, [, m]) => sum + (m.spend ?? 0), 0),
            totalFailures: scenarioYears.reduce((sum, [, m]) => sum + (m.expectedFailures ?? 0), 0),
            years: scenarioYears.map(([year, m]) => ({
              year,
              spend: m.spend ?? 0,
              avgCondition: m.avgCondition ?? null,
              expectedFailures: m.expectedFailures ?? null,
            })),
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// Adding work by hand
// ---------------------------------------------------------------------------

/**
 * One segment's treatment context, as the model sees it today.
 *
 * The same shape `buildCandidates` assembles, for the one segment someone is
 * adding work to — so a hand-added row is priced and judged by exactly the
 * rules and rates the model would have used had it chosen the work itself.
 */
async function assetTreatmentContext(
  organizationId: string,
  assetId: string
): Promise<{ ctx: AssetTreatmentContext; assetCode: string } | null> {
  const since = new Date(Date.now() - TEN_YEARS_MS);
  const asset = await prisma.asset.findFirst({
    // Active only, so work cannot be planned on a segment no run will touch.
    where: { id: assetId, organizationId, deletedAt: null, status: "ACTIVE" },
    include: {
      attributeValues: { include: { definition: true } },
      conditionMeasurements: { orderBy: { measurementDate: "desc" }, take: 1 },
      riskAssessments: { orderBy: { assessmentDate: "desc" }, take: 1 },
      failureEvents: { where: { failureDate: { gte: since } }, select: { id: true } },
      location: { select: { serviceArea: true, pressureZone: true } },
    },
  });
  if (!asset) return null;

  const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);
  const risk = asset.riskAssessments[0];
  const pof = risk?.probabilityScore ?? 3;
  const cof = risk?.consequenceScore ?? 3;

  return {
    assetCode: asset.assetCode,
    ctx: {
      conditionScore: asset.conditionMeasurements[0]?.score ?? null,
      material: attr(WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null,
      diameterInches: attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null,
      lengthFt: attr(WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? null,
      customersServed: attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null,
      pof,
      cof,
      riskScore: risk?.riskScore ?? pof * cof,
      failuresLast10Years: asset.failureEvents.length,
      ageYears: ageInYears(asset.installationDate),
      expectedUsefulLife: asset.expectedUsefulLife ?? 75,
      criticality: attr(WATERLINE_ATTRIBUTES.CRITICALITY)?.textValue ?? null,
      customerType: attr(WATERLINE_ATTRIBUTES.CUSTOMER_TYPE)?.textValue ?? null,
      serviceArea: asset.location?.serviceArea ?? null,
      pressureZone: asset.location?.pressureZone ?? null,
    },
  };
}

/**
 * Segments to add work to, by code or district.
 *
 * Only segments the model actually runs — active and not deleted, the same
 * population `buildSimAssets` builds from. Offering a retired main would let
 * work be scheduled that no run could ever carry out, and the plan would
 * quietly report it as skipped years later.
 *
 * Capped: this feeds a picker, and a list nobody can read is not a list.
 */
export async function searchSegments(organizationId: string, query: string) {
  const q = query.trim();
  const assets = await prisma.asset.findMany({
    where: {
      organizationId,
      assetType: { code: "WATERLINE" },
      deletedAt: null,
      status: "ACTIVE",
      ...(q
        ? {
            OR: [
              { assetCode: { contains: q, mode: "insensitive" as const } },
              { location: { serviceArea: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      assetCode: true,
      location: { select: { serviceArea: true } },
      conditionMeasurements: { orderBy: { measurementDate: "desc" }, take: 1, select: { score: true } },
    },
    orderBy: { assetCode: "asc" },
    take: 25,
  });
  return assets.map((a) => ({
    id: a.id,
    assetCode: a.assetCode,
    serviceArea: a.location?.serviceArea ?? null,
    condition: a.conditionMeasurements[0]?.score ?? null,
  }));
}

export type PlannedAddition = {
  assetCode: string;
  treatment: string;
  category: string;
  cost: number;
  conditionBefore: number | null;
  conditionAfter: number;
  riskBefore: number;
  riskAfter: number;
  /** Whether the treatment's own rules allow it here. False is allowed — a
   * programmed job is a decision, not a recommendation — but it is said. */
  qualifies: boolean;
  /** The rule that refuses it, when one does, so the warning can name it. */
  refusedBy: string | null;
};

/**
 * What adding this treatment to this segment would mean, before anything is
 * written: the price, the effect, and whether the library would have allowed
 * it. The page shows this and asks.
 */
export async function previewWorkPlanAddition(
  organizationId: string,
  input: { assetId: string; treatmentId: string }
): Promise<PlannedAddition> {
  const [found, library, treatment] = await Promise.all([
    assetTreatmentContext(organizationId, input.assetId),
    loadTreatmentDefs(organizationId),
    prisma.treatment.findFirst({
      where: { id: input.treatmentId, assetType: { code: "WATERLINE", organizationId } },
      select: { name: true },
    }),
  ]);
  if (!found) throw new Error("That segment is not an active one the model runs, so work cannot be planned on it");
  if (!treatment) throw new Error("That treatment no longer exists");

  const def = library.find((d) => d.name === treatment.name);
  if (!def) throw new Error(`${treatment.name} is not in the treatment library`);

  const option = buildOption(`t:${def.name}`, def.name, [def], found.ctx);
  if (!option) {
    throw new Error(
      `No price applies to ${found.assetCode} for ${def.name}. Add a rate that covers this segment under Treatment Costs.`
    );
  }

  const outcome = explainApplicability(def, found.ctx);
  const riskBefore = (found.ctx.pof ?? 3) * (found.ctx.cof ?? 3);

  return {
    assetCode: found.assetCode,
    treatment: def.name,
    category: option.category,
    cost: Math.round(option.cost),
    conditionBefore: found.ctx.conditionScore,
    conditionAfter: Math.round(option.projectedCondition * 10) / 10,
    riskBefore: Math.round(riskBefore * 10) / 10,
    riskAfter: Math.round(Math.max(1, riskBefore * option.failureProbMultiplier) * 10) / 10,
    qualifies: outcome.pass,
    refusedBy: outcome.blockedBy?.name ?? (outcome.pass ? null : "the treatment's own rules"),
  };
}

/**
 * Add a treatment to a plan by hand.
 *
 * A plan holds what an organization has decided to do, and that includes work
 * already committed for reasons the model knows nothing about — a road scheme
 * the main sits under, a developer contribution, a council promise. So the
 * rules are consulted and reported, never enforced: a row the library would
 * refuse goes in marked, and says which rule refused it.
 */
export async function addWorkPlanItem(
  organizationId: string,
  input: { workPlanId: string; assetId: string; treatmentId: string; year: number }
): Promise<{ added: PlannedAddition }> {
  const plan = await prisma.workPlan.findUnique({
    where: { id: input.workPlanId },
    select: { id: true, startYear: true, endYear: true, isScenarioMirror: true, name: true },
  });
  if (!plan) throw new Error("That work plan no longer exists");
  if (plan.isScenarioMirror) {
    throw new Error(
      `“${plan.name}” is a scenario run's own record and is rebuilt every time that scenario runs. Make a plan from the scenario first, then add work to that.`
    );
  }
  if (!Number.isFinite(input.year) || input.year < plan.startYear || input.year > plan.endYear) {
    throw new Error(`Choose a year between ${plan.startYear} and ${plan.endYear}`);
  }

  const preview = await previewWorkPlanAddition(organizationId, input);

  await prisma.workPlanItem.create({
    data: {
      workPlanId: plan.id,
      assetId: input.assetId,
      treatmentId: input.treatmentId,
      year: input.year,
      estimatedCost: preview.cost,
      expectedBenefit: {
        conditionBefore: preview.conditionBefore,
        conditionAfter: preview.conditionAfter,
        riskBefore: preview.riskBefore,
        riskAfter: preview.riskAfter,
        riskReductionPct:
          preview.riskBefore > 0
            ? Math.round(((preview.riskBefore - preview.riskAfter) / preview.riskBefore) * 1000) / 10
            : 0,
        // What marks a row nobody's model chose. Read by the page, and worth
        // keeping for anyone asking later why the plan holds this.
        addedByHand: true,
        forcedAgainstRules: !preview.qualifies,
        refusedBy: preview.qualifies ? null : preview.refusedBy,
      },
      reasonExplanation: [
        `Added by hand in ${input.year}.`,
        preview.qualifies
          ? "The treatment's rules allow it on this segment."
          : `The treatment's rules refuse it here — ${preview.refusedBy} — and it was added anyway.`,
        `Condition ${preview.conditionBefore ?? "unknown"} → ${preview.conditionAfter}, risk ${preview.riskBefore} → ${preview.riskAfter}.`,
      ].join(" "),
      fundingSource: "Added by hand",
      status: WorkPlanItemStatus.PLANNED,
    },
  });

  return { added: preview };
}

/** Take a row out of a plan. Only ever a row someone put there or moved — the
 * plan is a schedule, and removing from it changes no scenario. */
export async function removeWorkPlanItem(itemId: string) {
  const item = await prisma.workPlanItem.findUnique({ where: { id: itemId }, select: { workPlanId: true } });
  if (!item) throw new Error("That row no longer exists");
  await prisma.workPlanItem.delete({ where: { id: itemId } });
  return item.workPlanId;
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

/**
 * Idempotently create a baseline 5-year plan for the demo.
 *
 * The guard looks only for a plan belonging to **no scenario**, and that is
 * the whole point of it. It used to ask whether any work plan at all existed,
 * which by the time the seed reached here was always true: the step before it
 * runs the baseline scenarios, and every run materializes its funded projects
 * as a work plan (`persistScenarioProgram`). So this had never once created
 * anything — the seed announced a 5-year capital work plan and made none, from
 * the first commit onward.
 *
 * A scenario's funded programme cannot stand in for it either. That is a
 * 20-year forecast, rebuilt and thrown away on every run; this is the five
 * years a utility would take to a board, and the only kind of plan whose Move
 * and Status controls mean anything, because nothing regenerates over them.
 *
 * Not scoped to the organization, because a work plan does not belong to one:
 * the model has no organizationId and `listWorkPlans` above reads them all.
 * Reaching an organization from here would mean joining through the items,
 * which would also mean an empty plan never counted as existing.
 */
export async function ensureBaselineWorkPlan(organizationId: string): Promise<boolean> {
  const existing = await prisma.workPlan.findFirst({ where: { scenarioId: null } });
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
