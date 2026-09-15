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
import { selectForYear, NOT_SELECTED, SELECTED } from "./selection";
import { recordTreatment, withinInterval, type TreatmentHistory } from "./retreatment";
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
  type TreatmentCategory,
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
  /** Every alternative the run considered, when `trace` was asked for.
   * Empty otherwise. */
  alternatives: YearAlternative[];
  /** Years the network was aged, with no work, between the condition year
   * and the start year. Zero when the run starts in the condition year or
   * earlier. */
  agedYears: number;
  /** Average condition in the condition year, before any ageing. */
  conditionYearAvgCondition: number;
  /** Average condition at the start of the first year, after ageing. Equal to
   * the figure above when nothing was aged. */
  startAvgCondition: number;
};

/**
 * One option on one segment in one year, and what became of it.
 *
 * Every applicable option is here, not only the ranked ones: an option the
 * retreatment interval locked out is exactly what someone asking "why wasn't
 * this relined again" is looking for, and leaving it out would read as the
 * model never having considered it.
 *
 * The scores are the year's own. Expected Benefit is min-max normalized across
 * the options considered that year, so a Priority Score compares options within
 * its year and not across years — which is also why the same option scores
 * differently in 2027 and 2028 even when nothing was done to the segment.
 */
export type YearAlternative = {
  year: number;
  assetId: string;
  assetCode: string;
  /** The segment's condition when the year's options were built, before any
   * treatment this year and before the year's deterioration. */
  conditionBefore: number;
  optionLabel: string;
  members: string[];
  isCombination: boolean;
  category: TreatmentCategory;
  cost: number;
  /** Null for an option that never reached scoring — it was ruled out first. */
  benefit: number | null;
  priority: number | null;
  criticality: number;
  scaleFactor: number;
  categoryWeight: number;
  conditionAfter: number | null;
  riskBefore: number | null;
  riskAfter: number | null;
  /** Whether the run funded it this year. */
  selected: boolean;
  /** "Selected", or a few words saying what stopped it. */
  reason: string;
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
  /** Whether the work pays for itself over the horizon. Not a filter but a
   * tier: everything that does is bought before anything that does not. */
  paysForItself: boolean;
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
  year: number,
  history: TreatmentHistory,
  ctx: {
    library: TreatmentDef[];
    combinations: CombinationDef[];
    selection: OptionSelection;
    benefitWeights: BenefitWeights;
    categoryWeights: CategoryWeights;
    curves: Record<string, CurveParams>;
    fallbackReplacement: TreatmentDef;
  },
  /** Where to record options that never reach the ranked list, or null when
   * the run is not being traced. */
  trace: YearAlternative[] | null
): Candidate[] {
  type Pending = Omit<Candidate, "priority" | "benefit" | "terms" | "paysForItself">;
  const pending: Array<{ item: Pending; terms: BenefitTerms }> = [];

  /** An option that got no further, with the year's figures for the segment as
   * they stood when it was ruled out. */
  const ruledOut = (asset: SimAsset, option: TreatmentOption, reason: string) => {
    if (!trace) return;
    const pof = pofFromCondition(asset.condition);
    trace.push({
      year,
      assetId: asset.id,
      assetCode: asset.assetCode,
      conditionBefore: round1(asset.condition),
      optionLabel: option.label,
      members: option.members.map((m) => m.name),
      isCombination: option.members.length > 1,
      category: option.category,
      cost: Math.round(option.cost),
      benefit: null,
      priority: null,
      criticality: round1(asset.criticalityScore),
      scaleFactor: Math.round(asset.scaleFactor * 100) / 100,
      categoryWeight: categoryWeight(ctx.categoryWeights, option.category),
      conditionAfter: round1(option.projectedCondition),
      riskBefore: round1(pof * asset.cof),
      riskAfter: null,
      selected: false,
      reason,
    });
  };

  for (const asset of state) {
    // Enumerated even for a segment the strategy passes over, but only when
    // tracing: the question the trace answers is "what could have been done
    // here", and "nothing, the strategy was not looking at this segment" is an
    // answer. Outside a trace this is the hot loop, so it stays skipped.
    if (!isEligible(asset, assumptions)) {
      if (trace) {
        const ctxFor = buildContext(asset);
        for (const option of enumerateOptions(ctxFor, ctx.library, ctx.combinations)) {
          ruledOut(asset, option, NOT_RANKED.ineligible);
        }
      }
      continue;
    }

    const assetCtx = buildContext(asset);
    const applicable = enumerateOptions(assetCtx, ctx.library, ctx.combinations);
    let options = filterOptions(ctx.selection, applicable);
    if (trace) {
      const considered = new Set(options);
      for (const o of applicable) if (!considered.has(o)) ruledOut(asset, o, NOT_RANKED.notConsidered);
    }

    // Assessment buys information rather than condition, and retirement is a
    // decision about service rather than a capital project. Neither belongs in
    // a budget-constrained condition simulation; both remain available to the
    // network-wide ranking, which is not spending money.
    options = keep(options, (o) => o.category !== "Assess" && o.category !== "Retire", (o) =>
      ruledOut(asset, o, NOT_RANKED.notCapital)
    );
    if (assumptions.strategy === "replacement-only") {
      options = keep(options, (o) => o.category === "Renew", (o) => ruledOut(asset, o, NOT_RANKED.renewalOnly));
    }

    // Anything still inside its own lockout on this asset. A backstop for
    // rules looser than their author intended — see ./retreatment.ts, which
    // argues at length that it should rarely be what stops anything.
    options = keep(options, (o) => !withinInterval(history, asset.id, o, year), (o) =>
      ruledOut(asset, o, NOT_RANKED.retreatment)
    );
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
    paysForItself: s.raw.lifeCycleSaving > 0,
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
  // Two hard filters, then a tier.
  //
  // **It must do something**: lift the asset to the condition target, or cut
  // risk by at least MIN_RISK_REDUCTION_PCT. This stops per-dollar ranking
  // preferring a cheap patch that adds three points to a failing main.
  //
  // **It must clear the effectiveness floor** (§5.5), below that section's
  // condition line. Shared with the recommendation and the network-wide
  // ranking.
  const doesEnough = (c: Candidate) =>
    c.projectedCondition >= assumptions.conditionTarget || (riskPct(c) ?? 0) >= MIN_RISK_REDUCTION_PCT;

  const fundable = scored.filter((c) => {
    const enough = doesEnough(c);
    const clears = clearsEffectivenessFloor(c.asset.condition, riskPct(c));
    if (enough && clears) return true;
    // Scored, so the trace can show what it would have been worth — which is
    // the interesting part of an option ruled out on effect rather than price.
    if (trace) {
      trace.push({
        ...traceOf(c, year, ctx.categoryWeights),
        selected: false,
        reason: enough ? NOT_RANKED.belowFloor : NOT_RANKED.tooLittle,
      });
    }
    return false;
  });

  // **Paying for itself is a tier, not a filter.** Everything whose life-cycle
  // saving is positive is bought before anything whose is not, but the rest
  // stay on the list — so a budget larger than the work that pays back spends
  // the surplus on the next best thing rather than not at all.
  //
  // It was a hard filter first, and excluding the second tier entirely made
  // every scenario converge: budgets differing by two and a half times reached
  // the same condition, because the constraint stopped being money. It was a
  // filter at all because without it the model bought $336,012 of lining on
  // one segment every year for eighteen years — the benefit term is min-max
  // normalized, so in a year when everything left is marginal the best of a
  // marginal set still scores near 100. The retreatment interval is what makes
  // demotion safe: that purchase can now happen once every five years at
  // worst, not every year.
  return fundable.sort((a, b) => {
    if (a.paysForItself !== b.paysForItself) return a.paysForItself ? -1 : 1;
    return (b.priority ?? -1) - (a.priority ?? -1);
  });
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Partition in passing: keep what the rule allows, and hand the rest to the
 * trace before they are forgotten. */
function keep<T>(items: T[], allowed: (item: T) => boolean, dropped: (item: T) => void): T[] {
  const kept: T[] = [];
  for (const item of items) {
    if (allowed(item)) kept.push(item);
    else dropped(item);
  }
  return kept;
}

/** The trace row for an option that was scored: everything but what happened
 * to it, which its caller knows and this does not. */
function traceOf(c: Candidate, year: number, weights: CategoryWeights): Omit<YearAlternative, "selected" | "reason"> {
  return {
    year,
    assetId: c.asset.id,
    assetCode: c.asset.assetCode,
    conditionBefore: round1(c.asset.condition),
    optionLabel: c.option.label,
    members: c.option.members.map((m) => m.name),
    isCombination: c.option.members.length > 1,
    category: c.option.category,
    cost: Math.round(c.cost),
    benefit: round1(c.benefit),
    priority: c.priority,
    criticality: round1(c.asset.criticalityScore),
    scaleFactor: Math.round(c.asset.scaleFactor * 100) / 100,
    categoryWeight: categoryWeight(weights, c.option.category),
    conditionAfter: round1(c.projectedCondition),
    riskBefore: round1(c.riskNow),
    riskAfter: round1(c.riskAfter),
  };
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
  /** The first year of the run. A scenario set supplies its base year; on
   * its own a scenario starts in the year it is run. */
  startYear?: number;
  /** The year the assets' starting condition describes. Defaults to the
   * current year. When the run starts later than this, the network is aged
   * forward to the start year with no work done first. */
  conditionYear?: number;
  /**
   * Record every alternative the run considered, year by year, with what
   * happened to it.
   *
   * Off by default because it is a row per applicable option per segment per
   * year — tens of thousands on a real network, where the run itself only
   * needs the ones it funds. On, it is the audit trail behind the plan.
   */
  trace?: boolean;
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
  /** What each asset has already had, and when. Drives the retreatment
   * interval, and carries across years for the whole run. */
  const history: TreatmentHistory = new Map();
  const treatmentCount = new Map<string, number>();
  const alternatives: YearAlternative[] = [];
  const trace = options.trace ? alternatives : null;
  const conditionYear = options.conditionYear ?? new Date().getFullYear();
  const startYear = options.startYear ?? conditionYear;
  const years: ScenarioYearResult[] = [];
  const average = () => state.reduce((s, a) => s + a.condition, 0) / (state.length || 1);

  // 0. Carry the network to the start year. A plan that begins in 2028 is
  //    planning for the pipes as they will be in 2028, not as they were last
  //    measured — two more years down the curve. Nothing is funded in the gap:
  //    whatever is already programmed for those years is not known here, and
  //    assuming none is the conservative reading.
  //
  //    A start year before the condition year is not aged backwards. There is
  //    no honest way to un-deteriorate a pipe, so such a run starts from the
  //    condition as it stands.
  //
  //    Retreatment history is not advanced either: nothing was treated in the
  //    gap, so there is nothing to record.
  const conditionYearAvgCondition = average();
  const agedYears = Math.max(0, startYear - conditionYear);
  if (agedYears > 0) {
    for (const asset of state) {
      asset.effectiveAge += agedYears;
      asset.condition = evaluateCurve(asset.curve, asset.effectiveAge);
    }
  }
  // Outcomes are measured across the planning window, so they start where the
  // window starts rather than where the network was before ageing.
  const startCondition = new Map(state.map((a) => [a.id, a.condition]));
  const startAvgCondition = average();

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
    const candidates = rankCandidates(state, assumptions, year, history, {
      library,
      combinations,
      selection,
      benefitWeights,
      categoryWeights,
      curves,
      fallbackReplacement,
    }, trace);

    // 2. Choose what the year buys: categories in the plan's order, one
    //    treatment per asset, a combination preferred over its parts. §5.7.
    const outcome = selectForYear(candidates, budget, fundingPlan);

    // Recorded here rather than inside the selection engine, which is written
    // against a shape that knows nothing about segments or conditions.
    if (trace) {
      for (const candidate of candidates) {
        const reason = outcome.outcome.get(candidate) ?? NOT_SELECTED.budgetSpent;
        trace.push({ ...traceOf(candidate, year, categoryWeights), selected: reason === SELECTED, reason });
      }
    }

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
      recordTreatment(history, candidate.assetId, candidate.option, year);
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
    alternatives,
    agedYears,
    conditionYearAvgCondition: Math.round(conditionYearAvgCondition * 10) / 10,
    startAvgCondition: Math.round(startAvgCondition * 10) / 10,
  };
}

/**
 * Why an option never reached the ranked list. The rest of the reasons a row
 * can carry come from the selection engine — see NOT_SELECTED there.
 */
export const NOT_RANKED = {
  ineligible: "Segment not eligible this year",
  notConsidered: "Not in this scenario's options",
  notCapital: "Assess and Retire are not funded here",
  renewalOnly: "Renewal-only strategy",
  retreatment: "Within its retreatment interval",
  tooLittle: "Would not do enough",
  belowFloor: "Below the effectiveness floor",
} as const;

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
