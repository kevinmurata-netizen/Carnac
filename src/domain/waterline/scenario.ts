// Scenario engine (SPEC §15): run the network forward year by year under a
// funding constraint and a prioritization strategy, and report what actually
// happens to condition, risk, backlog, failures and spend.
//
// The simulation is deliberately legible: each year we rank candidates by the
// strategy's published rule, fund down the list until the budget runs out,
// apply the treatment's stored effects, and deteriorate everything that went
// untreated. No optimizer, no black box — Phase 7 adds the optimization layer
// on top of this.

import {
  curveFor,
  evaluateCurve,
  effectiveAgeForCondition,
  MATERIAL_CURVES,
  type CurveParams,
} from "./deterioration";

export { curveFor };
import { annualFailureProbability, failureEventCost, presentValue } from "./lcca";
import { categoryWeight, NEUTRAL_CATEGORY_WEIGHTS, type CategoryWeights } from "./category-weight";
import { CONSIDER_ALL, filterOptions, type OptionSelection } from "./option-selection";
import { type FundingPlan } from "./category-funding";
import { selectForYear } from "./selection";
import { buildLccaEvaluator } from "./lcca-evaluator";
import {
  benefitCof,
  optionTerms,
  priorityScore,
  scoreBenefits,
  DEFAULT_BENEFIT_WEIGHTS,
  type BenefitTerms,
  type BenefitWeights,
} from "./benefit";
import {
  WATERLINE_TREATMENTS,
  MIN_RISK_REDUCTION_PCT,
  clearsEffectivenessFloor,
  enumerateOptions,
  type AssetTreatmentContext,
  type TreatmentDef,
  type TreatmentOption,
  type CombinationDef,
} from "./treatment";

export const STRATEGIES = [
  "risk-based",
  "condition-based",
  "lowest-lifecycle-cost",
  "replacement-only",
  "preventive",
] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const STRATEGY_DESCRIPTIONS: Record<Strategy, string> = {
  "risk-based": "Fund the highest-risk segments first (risk = probability × consequence).",
  "condition-based": "Fund the worst-condition segments first, regardless of consequence.",
  "lowest-lifecycle-cost": "Fund the work that removes the most risk per dollar spent.",
  "replacement-only": "Renewal only — no interim repair or rehabilitation.",
  preventive: "Treat segments while still in Fair condition, before they fail.",
};

export type ScenarioAssumptions = {
  annualBudget: number;
  /** Fractional annual growth in the budget, e.g. 0.03 for 3%/yr. */
  fundingGrowth: number;
  discountRate: number;
  analysisPeriodYears: number;
  conditionTarget: number;
  riskThreshold: number;
  strategy: Strategy;
};

export const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = {
  annualBudget: 4_000_000,
  fundingGrowth: 0.03,
  discountRate: 0.04,
  analysisPeriodYears: 20,
  conditionTarget: 70,
  riskThreshold: 10,
  strategy: "risk-based",
};

/** Per-asset state carried through the simulation. */
export type SimAsset = {
  id: string;
  assetCode: string;
  material: string | null;
  diameterInches: number | null;
  lengthFt: number | null;
  customersServed: number | null;
  /** Consequence rating is a property of what the asset serves, so it does
   * not change as the pipe degrades or is renewed. */
  cof: number;
  condition: number;
  /** Position on the material's deterioration curve, in years. */
  effectiveAge: number;
  curve: CurveParams;
  /** Carried only so treatment rules can test them. The simulation itself
   * never reads these — but a rule written against a district has to see the
   * same value here that it sees on the work plan, or a scenario and the plan
   * it justifies would disagree about which treatments were even allowed. */
  criticality: string | null;
  serviceArea: string | null;
  pressureZone: string | null;

  /** What the asset is worth, 0-100 — the Priority Score's first term. Fixed
   * for the run: criticality describes what the asset serves, which treating
   * the pipe does not change. */
  criticalityScore: number;

  /** How big a piece of work this asset is — the Priority Score's second
   * term. Also fixed: it is a formula over length, diameter and the like,
   * none of which a treatment alters. */
  scaleFactor: number;

  /** Customer type, for the criticality-free consequence behind Expected
   * Benefit. Null gets the same "Unknown" rating a missing value gets
   * everywhere else. */
  customerType: string | null;
};

/** A single funded project inside a scenario run. */
export type ScenarioProject = {
  assetId: string;
  assetCode: string;
  treatment: string;
  category: string;
  cost: number;
  conditionBefore: number;
  conditionAfter: number;
  riskBefore: number;
  riskAfter: number;
};

export type ScenarioYearResult = {
  year: number;
  budget: number;
  spend: number;
  treatedCount: number;
  avgCondition: number;
  avgRisk: number;
  /** Cost of identified-but-unfunded work at the end of the year. */
  backlog: number;
  backlogCount: number;
  expectedFailures: number;
  failureCost: number;
  belowTargetCount: number;
  aboveRiskThresholdCount: number;
  /** The actual projects funded this year, in the order they were selected. */
  selected: ScenarioProject[];
  /** What each category took, and what it was allowed to take. Present so a
   * plan can show that renewal absorbed what the capped categories left,
   * rather than leaving that to be inferred from the project list. */
  byCategory: Array<{ category: string; spent: number; cap: number }>;
  /** Cost of work skipped this year because its category was full, though the
   * budget was not. Zero when nothing is capped. */
  cappedOut: number;
};

export type ScenarioRunResult = {
  years: ScenarioYearResult[];
  totalSpend: number;
  totalFailureCost: number;
  /** Present value of spend + failure cost over the period. */
  lifecycleCostNpv: number;
  finalAvgCondition: number;
  finalBacklog: number;
  totalFailures: number;
  /** Where each asset started and ended, so a run can be shown as a flow
   * between condition bands rather than only as yearly averages. */
  assetOutcomes: AssetOutcome[];
};

export type AssetOutcome = {
  assetId: string;
  assetCode: string;
  material: string | null;
  startCondition: number;
  endCondition: number;
  /** How many times this asset was treated over the period. */
  treatments: number;
};

/** `curves` is injected so forecasts run against the deterioration models
 * configured in Settings; it defaults to the seeded material curves. */

/** POF rating 1-5 implied by current condition. Mirrors the Phase 3 risk
 * model's condition factor so scenario risk stays comparable to stored
 * assessments. */
export function pofFromCondition(condition: number): number {
  const inverted = 100 - condition;
  if (inverted < 15) return 1;
  if (inverted < 30) return 2;
  if (inverted < 50) return 3;
  if (inverted < 75) return 4;
  return 5;
}

type Candidate = {
  /** Duplicated from `asset` so the candidate satisfies `Rankable`, which the
   * selection engine is written against and which knows nothing about
   * simulation state. */
  assetId: string;
  asset: SimAsset;
  option: TreatmentOption;
  cost: number;
  projectedCondition: number;
  riskNow: number;
  riskAfter: number;
  riskReduction: number;
  /** Criticality x Scale Factor x Category Weight x Expected Benefit / Total
   * Cost. Null when the option could not be priced. */
  priority: number | null;
  /** The three terms behind the benefit half, kept so a funded project can
   * explain itself. */
  terms: BenefitTerms;
  benefit: number;
};

function buildContext(asset: SimAsset): AssetTreatmentContext {
  const pof = pofFromCondition(asset.condition);
  return {
    conditionScore: asset.condition,
    material: asset.material,
    diameterInches: asset.diameterInches,
    lengthFt: asset.lengthFt,
    customersServed: asset.customersServed,
    pof,
    cof: asset.cof,
    riskScore: Math.round(pof * asset.cof * 10) / 10,
    failuresLast10Years: 0,
    ageYears: Math.round(asset.effectiveAge),
    expectedUsefulLife: asset.curve.serviceLife,
    criticality: asset.criticality,
    customerType: asset.customerType,
    serviceArea: asset.serviceArea,
    pressureZone: asset.pressureZone,
  };
}

/**
 * Every option on every eligible asset, scored and sorted highest first.
 *
 * This is the Priority Score applied inside the simulation, and it is
 * deliberately the same arithmetic as `server/priority.ts` uses for the whole
 * network: Expected Benefit is min-max normalized across the entire set of
 * options considered this year, then multiplied by criticality, scale and
 * category weight and divided by total cost.
 *
 * Normalizing across the year's whole set rather than per asset is what makes
 * two assets' benefit scores comparable, which is the only reason ranking them
 * against each other means anything. It also means a score is relative to the
 * year it was computed in — fine for ordering within a year, which is all it
 * is used for, and not to be compared across years.
 */
function rankCandidates(
  state: SimAsset[],
  assumptions: ScenarioAssumptions,
  ctx: {
    library: TreatmentDef[];
    combinations: CombinationDef[];
    selection: OptionSelection;
    benefitWeights: BenefitWeights;
    categoryWeights: CategoryWeights;
    curves: Record<string, CurveParams>;
    fallbackReplacement: TreatmentDef;
  }
): Candidate[] {
  type Pending = Omit<Candidate, "priority" | "benefit" | "terms">;
  const pending: Array<{ item: Pending; terms: BenefitTerms }> = [];

  for (const asset of state) {
    if (!isEligible(asset, assumptions)) continue;

    const assetCtx = buildContext(asset);
    let options = filterOptions(ctx.selection, enumerateOptions(assetCtx, ctx.library, ctx.combinations));

    // Assessment buys information rather than condition, and retirement is a
    // decision about service rather than a capital project. Neither belongs in
    // a budget-constrained condition simulation; both remain available to the
    // network-wide ranking, which is not spending money.
    options = options.filter((o) => o.category !== "Assess" && o.category !== "Retire");
    if (assumptions.strategy === "replacement-only") {
      options = options.filter((o) => o.category === "Renew");
    }
    if (options.length === 0) continue;

    const pof = assetCtx.pof ?? pofFromCondition(asset.condition);
    const riskNow = pof * asset.cof;

    // Criticality-free consequence, so the multiplier is not also hiding
    // inside the risk term. §5.3.
    const cofNoCriticality = benefitCof({
      customersServed: asset.customersServed,
      criticality: asset.criticality,
      diameterInches: asset.diameterInches,
      customerType: asset.customerType,
    });

    // One evaluator per asset per year, reused across its options: building it
    // per option would repeat the whole deterioration walk for every
    // candidate, and this loop already runs once a year for twenty years.
    const lcca = buildLccaEvaluator(assetCtx, asset.condition, ctx.library, ctx.curves, ctx.fallbackReplacement);

    for (const option of options) {
      const riskAfter =
        option.failureProbMultiplier === 0 ? 0 : Math.max(1, pof * option.failureProbMultiplier) * asset.cof;

      pending.push({
        item: {
          assetId: asset.id,
          asset,
          option,
          cost: option.cost,
          projectedCondition: option.projectedCondition,
          riskNow,
          riskAfter,
          riskReduction: Math.max(0, riskNow - riskAfter),
        },
        terms: optionTerms(option, assetCtx, cofNoCriticality, lcca ? lcca.savingFor(option) : 0),
      });
    }
  }

  const scored = scoreBenefits(pending, ctx.benefitWeights).map<Candidate>((s) => ({
    ...s.item,
    terms: s.raw,
    benefit: s.benefit,
    priority: priorityScore({
      criticality: s.item.asset.criticalityScore,
      scaleFactor: s.item.asset.scaleFactor,
      categoryWeight: categoryWeight(ctx.categoryWeights, s.item.option.category),
      benefit: s.benefit,
      totalCost: s.item.cost,
    }),
  }));

  const riskPct = (c: Candidate) =>
    c.riskNow > 0 ? ((c.riskNow - c.riskAfter) / c.riskNow) * 100 : null;

  // Two filters, and both matter.
  //
  // The effectiveness floor is shared with the recommendation and the
  // network-wide ranking: a patch that leaves a failing main failing is not
  // funded whatever it scores per dollar. §5.5.
  //
  // The meaningfulness test is older and, in a simulation that runs the same
  // network forward twenty times, does more work. A treatment only counts as
  // addressing an asset if it either lifts it to the condition target or cuts
  // risk materially. Without it, ranking by value for money buys a small
  // improvement on the same segment over and over: each pass looks like the
  // best available spend, and the network decays while the budget is fully
  // committed to churn. Measured on the seed network, dropping it cost 30 WCI
  // points while spending twice as much.
  // Three tests, and the simulation needs all of them. Each was added because
  // the run misbehaved without it, and the misbehaviour is recorded so nobody
  // removes one on the grounds that it looks redundant.
  //
  //  * **It must pay for itself.** Life-cycle saving over the horizon must be
  //    positive. Without this the model buys $336,000 of lining every year for
  //    eighteen years to hold one segment at 70 WCI, because the Priority
  //    Score's benefit term is min-max normalized: in a year when everything
  //    left is marginal, the best of a marginal set still scores near 100, and
  //    criticality x scale then swamps the fact that the gain was 1.5 points.
  //    Measured, dropping this test cost 27 WCI points across the network
  //    while spending the entire budget.
  //
  //  * **It must do something.** Lift the asset to the condition target, or
  //    cut risk by at least MIN_RISK_REDUCTION_PCT. Older than the rest, and
  //    it stops per-dollar ranking preferring a cheap patch that adds three
  //    points to a failing main.
  //
  //  * **It must clear the effectiveness floor**, below §5.5's condition line.
  //    Shared with the recommendation and the network-wide ranking.
  //
  // The first two are ANDed on purpose. Requiring only material risk reduction
  // lets the expensive marginal work back in — measured at 49.3 WCI against
  // 71.4 — because a big lining job on a middling asset does clear 25%.
  const worthDoing = scored.filter(
    (c) =>
      c.terms.lifeCycleSaving > 0 &&
      (c.projectedCondition >= assumptions.conditionTarget ||
        (riskPct(c) ?? 0) >= MIN_RISK_REDUCTION_PCT)
  );

  const fundable = (worthDoing.length > 0 ? worthDoing : scored).filter((c) =>
    clearsEffectivenessFloor(c.asset.condition, riskPct(c))
  );

  return fundable.sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1));
}

function isEligible(asset: SimAsset, a: ScenarioAssumptions): boolean {
  const risk = pofFromCondition(asset.condition) * asset.cof;
  switch (a.strategy) {
    case "preventive":
      // Act while still serviceable — between Poor and the condition target.
      return asset.condition < a.conditionTarget && asset.condition >= 40;
    case "replacement-only":
      return asset.condition < 45;
    case "risk-based":
      return risk >= a.riskThreshold || asset.condition < a.conditionTarget;
    case "condition-based":
      return asset.condition < a.conditionTarget;
    case "lowest-lifecycle-cost":
      return asset.condition < a.conditionTarget;
  }
}

/**
 * What a run needs beyond the assets and the assumptions.
 *
 * An object rather than seven positional parameters: this grew one argument at
 * a time as scale factors, category weights, option selection and funding
 * order arrived, and a call site reading `runScenario(a, b, c, d, e, f, g)`
 * tells the reader nothing about which is which.
 */
export type ScenarioRunOptions = {
  library?: TreatmentDef[];
  combinations?: CombinationDef[];
  /** Which treatments and combinations this scenario may consider. Null is
   * the whole library. */
  selection?: OptionSelection;
  /** How much condition, risk reduction and life-cycle saving each count
   * toward Expected Benefit. */
  benefitWeights?: BenefitWeights;
  /** How far the scenario leans toward each kind of work, as a multiplier on
   * the Priority Score. */
  categoryWeights?: CategoryWeights;
  /** The share of each year each category may take, and the order they take
   * it in. Null means one pass down the ranked list, ignoring category. */
  fundingPlan?: FundingPlan;
  /** Deterioration curves by material. */
  curves?: Record<string, CurveParams>;
};

/**
 * Run the network forward under a budget, choosing each year's work by
 * Priority Score.
 *
 * The year is a closed loop, and that is the point: options are enumerated
 * from the network's *current* condition, scored, selected, applied, and then
 * everything deteriorates a year before the next pass. A treatment bought in
 * year 3 changes what is worth buying in year 4, and an asset left alone gets
 * worse until it is. Nothing is decided once and replayed.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.7.
 */
export function runScenario(
  assets: SimAsset[],
  assumptions: ScenarioAssumptions,
  options: ScenarioRunOptions = {}
): ScenarioRunResult {
  const library = options.library ?? WATERLINE_TREATMENTS;
  const combinations = options.combinations ?? [];
  const selection = options.selection ?? CONSIDER_ALL;
  const benefitWeights = options.benefitWeights ?? DEFAULT_BENEFIT_WEIGHTS;
  const categoryWeights = options.categoryWeights ?? NEUTRAL_CATEGORY_WEIGHTS;
  const fundingPlan = options.fundingPlan ?? null;
  const curves = options.curves ?? MATERIAL_CURVES;
  const fallbackReplacement =
    library.find((d) => d.name === "Replacement") ?? WATERLINE_TREATMENTS.find((d) => d.name === "Replacement")!;

  // Work on copies so a scenario run never mutates caller state.
  const state: SimAsset[] = assets.map((a) => ({ ...a }));
  const startCondition = new Map(assets.map((a) => [a.id, a.condition]));
  const treatmentCount = new Map<string, number>();
  const startYear = new Date().getFullYear();
  const years: ScenarioYearResult[] = [];

  let totalSpend = 0;
  let totalFailureCost = 0;
  let totalFailures = 0;
  let lifecycleCostNpv = 0;

  for (let i = 0; i < assumptions.analysisPeriodYears; i++) {
    const year = startYear + i;
    const budget = assumptions.annualBudget * Math.pow(1 + assumptions.fundingGrowth, i);

    // 1. Every option on every eligible asset, priced and scored against this
    //    year's condition. Rebuilt each year on purpose — last year's work
    //    and a year of deterioration both change what is worth doing.
    const candidates = rankCandidates(state, assumptions, {
      library,
      combinations,
      selection,
      benefitWeights,
      categoryWeights,
      curves,
      fallbackReplacement,
    });

    // 2. Choose what the year buys: categories in the plan's order, one
    //    treatment per asset, a combination preferred over its parts. §5.7.
    const outcome = selectForYear(candidates, budget, fundingPlan);

    let treatedCount = 0;
    const treated = new Set<string>();
    const selected: ScenarioProject[] = [];
    for (const candidate of outcome.selected) {
      treatedCount++;
      treatmentCount.set(candidate.asset.id, (treatmentCount.get(candidate.asset.id) ?? 0) + 1);
      treated.add(candidate.asset.id);
      selected.push({
        assetId: candidate.asset.id,
        assetCode: candidate.asset.assetCode,
        treatment: candidate.option.label,
        category: candidate.option.category,
        cost: Math.round(candidate.cost),
        conditionBefore: Math.round(candidate.asset.condition * 10) / 10,
        conditionAfter: Math.round(candidate.projectedCondition * 10) / 10,
        riskBefore: Math.round(candidate.riskNow * 10) / 10,
        riskAfter: Math.round(candidate.riskAfter * 10) / 10,
      });
      candidate.asset.condition = candidate.projectedCondition;
      candidate.asset.effectiveAge = effectiveAgeForCondition(candidate.asset.curve, candidate.projectedCondition);
    }

    // 3. A year passes for the whole network — including assets treated this
    // year. Exempting them would let a cheap patch freeze deterioration for a
    // year, which compounds into a large artificial gain over the period.
    for (const asset of state) {
      asset.effectiveAge += 1;
      asset.condition = evaluateCurve(asset.curve, asset.effectiveAge);
    }

    // 4. Expected failures and their cost, based on end-of-year condition.
    let expectedFailures = 0;
    let failureCost = 0;
    for (const asset of state) {
      const rate = annualFailureProbability(pofFromCondition(asset.condition));
      expectedFailures += rate;
      failureCost += rate * failureEventCost(asset).total;
    }

    // 5. Unfunded-but-needed work becomes backlog: the best option on every
    //    asset that went untreated, not every option on it. Counting all of
    //    them would report the same segment several times over and inflate the
    //    figure by whatever the library happens to offer.
    const backlogBest = new Map<string, number>();
    for (const candidate of candidates) {
      if (treated.has(candidate.assetId)) continue;
      if (!backlogBest.has(candidate.assetId)) backlogBest.set(candidate.assetId, candidate.cost);
    }
    const backlog = [...backlogBest.values()].reduce((sum, cost) => sum + cost, 0);

    const avgCondition = state.reduce((s, a) => s + a.condition, 0) / (state.length || 1);
    const avgRisk =
      state.reduce((s, a) => s + pofFromCondition(a.condition) * a.cof, 0) / (state.length || 1);

    const spend = outcome.totalSpent;
    totalSpend += spend;
    totalFailureCost += failureCost;
    totalFailures += expectedFailures;
    lifecycleCostNpv += presentValue(spend + failureCost, i, assumptions.discountRate);

    years.push({
      year,
      budget: Math.round(budget),
      spend: Math.round(spend),
      treatedCount,
      avgCondition: Math.round(avgCondition * 10) / 10,
      avgRisk: Math.round(avgRisk * 10) / 10,
      backlog: Math.round(backlog),
      backlogCount: backlogBest.size,
      expectedFailures: Math.round(expectedFailures * 10) / 10,
      failureCost: Math.round(failureCost),
      belowTargetCount: state.filter((a) => a.condition < assumptions.conditionTarget).length,
      aboveRiskThresholdCount: state.filter(
        (a) => pofFromCondition(a.condition) * a.cof >= assumptions.riskThreshold
      ).length,
      selected,
      byCategory: outcome.byCategory.map((r) => ({
        category: r.category,
        spent: Math.round(r.spent),
        cap: Math.round(r.cap),
      })),
      cappedOut: Math.round(outcome.cappedOut),
    });
  }

  const last = years[years.length - 1];
  return {
    years,
    totalSpend: Math.round(totalSpend),
    totalFailureCost: Math.round(totalFailureCost),
    lifecycleCostNpv: Math.round(lifecycleCostNpv),
    finalAvgCondition: last?.avgCondition ?? 0,
    finalBacklog: last?.backlog ?? 0,
    totalFailures: Math.round(totalFailures),
    assetOutcomes: state.map((a) => ({
      assetId: a.id,
      assetCode: a.assetCode,
      material: a.material,
      startCondition: Math.round((startCondition.get(a.id) ?? a.condition) * 10) / 10,
      endCondition: Math.round(a.condition * 10) / 10,
      treatments: treatmentCount.get(a.id) ?? 0,
    })),
  };
}

/** Metric keys persisted to ScenarioResult rows. */
export const SCENARIO_METRICS = [
  "budget",
  "spend",
  "treatedCount",
  "avgCondition",
  "avgRisk",
  "backlog",
  "expectedFailures",
  "failureCost",
  "belowTargetCount",
] as const;
