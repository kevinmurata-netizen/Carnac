// Scenario engine with delivery lead times: programmed, funded, built.
//
// The engine next door decides, pays for and improves the network in one year.
// That is true of a leak repair and false of a replacement, which a utility
// programs years before the money moves and years more before anyone digs.
// This one separates the three.
//
// The year loop is still a year loop, and it is still causal — nothing is
// decided in a year it could not have been decided in. What changes:
//
//  1. **A year decides; other years pay and build.** Programming work in 2026
//     reserves its money in the years its lead time says, and the network
//     improves in the year it is built.
//
//  2. **Options are judged on the network they will meet.** A renewal decided
//     in 2026 and built in 2032 acts on a segment six years worse than today's,
//     so that is the segment it is scored against — its rules, its cost, its
//     benefit. Without this the model would systematically over-value long-lead
//     work, and could never justify programming a renewal before the segment
//     already needed one.
//
//  3. **A segment holds one project at a time.** From the year work is
//     programmed until the year it is built, nothing else is programmed on that
//     segment — except a larger project that *supersedes* it, which gives the
//     first project's money back to the years it had reserved. That is the
//     "cancel the interim repair and return its budget" rule, expressed as a
//     step up the same ladder every other choice is made on.
//
// See docs/TREATMENT-MODEL-REBUILD.md §5.7 for the ladder, and
// ./lead-time.ts for what the offsets mean.

import { evaluateCurve, effectiveAgeForCondition, MATERIAL_CURVES, type CurveParams } from "./deterioration";
import { annualFailureProbability, failureEventCost, presentValue } from "./lcca";
import { buildLccaEvaluator } from "./lcca-evaluator";
import { categoryWeight, NEUTRAL_CATEGORY_WEIGHTS } from "./category-weight";
import { CONSIDER_ALL, filterOptions } from "./option-selection";
import { categoryLimits } from "./category-funding";
import { NOT_SELECTED, SELECTED, selectAgainst, type Purse, type Rankable } from "./selection";
import { recordTreatment, withinInterval, type TreatmentHistory } from "./retreatment";
import {
  benefitCof,
  optionTerms,
  priorityScore,
  scoreBenefits,
  DEFAULT_BENEFIT_WEIGHTS,
  type BenefitTerms,
} from "./benefit";
import {
  WATERLINE_TREATMENTS,
  MIN_RISK_REDUCTION_PCT,
  clearsEffectivenessFloor,
  enumerateOptions,
  splitOptionCost,
  type AssetTreatmentContext,
  type TreatmentOption,
} from "./treatment";
import { cashPlan, leadTimeFor, type LeadTime, type LeadTimes } from "./lead-time";
import {
  NOT_RANKED,
  pofFromCondition,
  simAssetContext,
  type ScenarioAssumptions,
  type ScenarioProject,
  type ScenarioRunOptions,
  type ScenarioRunResult,
  type ScenarioYearResult,
  type SimAsset,
  type YearAlternative,
} from "./scenario";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Work decided but not yet built, and what it has reserved. */
type Commitment = {
  assetId: string;
  option: TreatmentOption;
  cost: number;
  programYear: number;
  buildYear: number;
  cash: Array<{ year: number; amount: number }>;
  /** The segment as it will be in the build year, and what the work leaves it
   * at. Exact rather than a guess: the segment is held from the year the work
   * is programmed, so nothing else can move it in between. */
  conditionBefore: number;
  conditionAfter: number;
  riskBefore: number;
  riskAfter: number;
  /** The context it was priced and scored against, so it can be re-scored
   * against later years' candidates without being re-derived. */
  ctx: AssetTreatmentContext;
  terms: BenefitTerms;
  project: ScenarioProject;
};

type Candidate = Rankable & {
  asset: SimAsset;
  option: TreatmentOption;
  cost: number;
  priority: number | null;
  value: number;
  benefit: number;
  lead: LeadTime;
  programYear: number;
  buildYear: number;
  cash: Array<{ year: number; amount: number }>;
  conditionBefore: number;
  projectedCondition: number;
  riskNow: number;
  riskAfter: number;
  ctx: AssetTreatmentContext;
  terms: BenefitTerms;
  /** Set when this candidate *is* the work the segment already holds. */
  held: Commitment | null;
};

export type DeliveryYearResult = ScenarioYearResult & {
  /** Work decided this year, whenever it is paid for or built. */
  programmedCount: number;
  /** Work built this year, whenever it was decided. */
  builtCount: number;
  /** Work decided in an earlier year and dropped this one in favour of
   * something larger, with its money returned to the years it had reserved. */
  supersededCount: number;
  supersededValue: number;
};

export type DeliveryRunResult = Omit<ScenarioRunResult, "years"> & {
  years: DeliveryYearResult[];
  /** Work programmed inside the run that is still to be built when it ends —
   * money spent whose benefit the run never sees. Reported rather than hidden,
   * because a run that ends mid-programme should say so. */
  inFlight: Array<{ assetCode: string; treatment: string; programYear: number; buildYear: number; cost: number }>;
  inFlightCost: number;
  /** The set the run used, for the record. */
  leadTimeName: string;
  /** How many times the run went round, and what the last pass added. A last
   * pass that still found work means the answer had not settled. */
  passes: number;
  addedInLastPass: number;
};

/**
 * Money across the years of a run, rather than one year at a time.
 *
 * A project reserves its instalments in the years its lead time puts them, and
 * each of those years has its own budget and its own category limits. Stepping
 * a segment up releases whatever its earlier choice had reserved, wherever
 * those years were — which is what makes "programme the renewal and cancel the
 * interim repair" a single decision rather than a correction afterwards.
 */
function ledger(
  budgetFor: (year: number) => number,
  plan: ScenarioRunOptions["fundingPlan"],
  endYear: number
) {
  const spent = new Map<number, number>();
  const spentByCategory = new Map<string, number>();
  const limitsFor = new Map<number, Map<string, number> | null>();

  const key = (year: number, category: string) => `${year}|${category}`;
  const limits = (year: number) => {
    if (!limitsFor.has(year)) limitsFor.set(year, categoryLimits(plan ?? null, budgetFor(year)));
    return limitsFor.get(year)!;
  };
  const capFor = (year: number, category: string) => {
    const l = limits(year);
    return l == null ? budgetFor(year) : (l.get(category as never) ?? 0);
  };

  const move = (c: Candidate, sign: 1 | -1) => {
    for (const instalment of c.cash) {
      spent.set(instalment.year, (spent.get(instalment.year) ?? 0) + sign * instalment.amount);
      const k = key(instalment.year, c.option.category);
      spentByCategory.set(k, (spentByCategory.get(k) ?? 0) + sign * instalment.amount);
    }
  };

  const purse: Purse<Candidate> = {
    unfunded: (c) => (capFor(c.cash[0]?.year ?? endYear, c.option.category) <= 0 ? NOT_SELECTED.categoryUnfunded : null),
    check(next, current) {
      // Money that would fall past the end of the run cannot be checked
      // against a budget nobody has set, so it is not programmed. Work that is
      // paid for inside the run but built after it is allowed, and reported.
      if (next.cash.some((i) => i.year > endYear)) return NOT_SELECTED.beyondHorizon;

      const totals = new Map<number, number>();
      const byCategory = new Map<string, number>();
      const add = (c: Candidate, sign: 1 | -1) => {
        for (const i of c.cash) {
          totals.set(i.year, (totals.get(i.year) ?? 0) + sign * i.amount);
          const k = key(i.year, c.option.category);
          byCategory.set(k, (byCategory.get(k) ?? 0) + sign * i.amount);
        }
      };
      add(next, 1);
      if (current) add(current, -1);

      for (const [year, delta] of totals) {
        if ((spent.get(year) ?? 0) + delta > budgetFor(year) + 0.01) return NOT_SELECTED.budgetSpent;
      }
      for (const [k, delta] of byCategory) {
        const [yearText, category] = k.split("|");
        const year = Number(yearText);
        if ((spentByCategory.get(k) ?? 0) + delta > capFor(year, category) + 0.01) return NOT_SELECTED.categoryFull;
      }
      return null;
    },
    commit(next, current) {
      if (current) move(current, -1);
      move(next, 1);
    },
    byCategory: () => {
      const byCategory = new Map<string, number>();
      for (const [k, value] of spentByCategory) {
        const category = k.split("|")[1];
        byCategory.set(category, (byCategory.get(category) ?? 0) + value);
      }
      return [...byCategory].map(([category, value]) => ({
        category: category as never,
        spent: value,
        cap: 0,
      }));
    },
    totalSpent: () => [...spent.values()].reduce((sum, v) => sum + v, 0),
  };

  return {
    purse,
    /** Money already spoken for before the pass starts. */
    reserve: (c: Candidate | { cash: Candidate["cash"]; option: Candidate["option"] }) =>
      move(c as Candidate, 1),
    spentIn: (year: number) => spent.get(year) ?? 0,
    byCategoryIn: (year: number) => {
      const l = limits(year);
      const categories = l == null ? ["All"] : [...l.keys()];
      return categories.map((category) => ({
        category,
        spent: l == null ? (spent.get(year) ?? 0) : (spentByCategory.get(key(year, category)) ?? 0),
        cap: l == null ? budgetFor(year) : (l.get(category as never) ?? 0),
      }));
    },
  };
}

export type DeliveryRunOptions = ScenarioRunOptions & {
  leadTimes: LeadTimes;
  /**
   * How many times the run may go round.
   *
   * Superseding work returns its money to years the walk has already gone
   * past, and those years cannot spend it again on the way through. So the
   * run is repeated: everything decided last time is fixed in place, and the
   * money that came back is offered to segments that hold nothing at all.
   *
   * Each pass only ever adds, so this terminates — the count is a ceiling on
   * work, not a guard against a loop, and a run that finds nothing to add
   * stops early. Four is enough for the seed network, where the passes add
   * 280, then 46, then 2, then none; the result says how many were used and
   * whether the last one was still finding work.
   */
  maxPasses?: number;
};

/**
 * Run the network forward with delivery lead times.
 *
 * Deliberately the same arithmetic as `runScenario` everywhere it can be: the
 * same Expected Benefit, the same Priority Score, the same ladder, the same
 * effectiveness floor. What differs is *when* — which is the whole question
 * this engine exists to answer, and the only thing that should differ if the
 * two runs are to be compared.
 */
export function runDeliveryScenario(
  assets: SimAsset[],
  assumptions: ScenarioAssumptions,
  options: DeliveryRunOptions
): DeliveryRunResult {
  const maxPasses = Math.max(1, options.maxPasses ?? 4);
  let fixed: Commitment[] = [];
  let outcome = walk(assets, assumptions, options, fixed);
  let passes = 1;
  let added = outcome.decided.length;

  while (passes < maxPasses) {
    fixed = outcome.decided;
    const next = walk(assets, assumptions, options, fixed);
    added = next.decided.length - fixed.length;
    passes++;
    outcome = next;
    if (added <= 0) break;
  }

  return { ...outcome.result, passes, addedInLastPass: Math.max(0, added) };
}

/**
 * One pass over the run.
 *
 * `fixed` is work an earlier pass decided. It is reproduced exactly — its
 * money reserved before the pass begins, its effects applied in the year it
 * was built — and the segments it touches are left alone for the whole pass,
 * so nothing added here can change the network a fixed project was judged
 * against. What is left of each year's budget is then offered to segments that
 * hold nothing.
 */
function walk(
  assets: SimAsset[],
  assumptions: ScenarioAssumptions,
  options: DeliveryRunOptions,
  fixed: Commitment[]
): { result: Omit<DeliveryRunResult, "passes" | "addedInLastPass">; decided: Commitment[] } {
  const library = options.library ?? WATERLINE_TREATMENTS;
  const combinations = options.combinations ?? [];
  const selection = options.selection ?? CONSIDER_ALL;
  const benefitWeights = options.benefitWeights ?? DEFAULT_BENEFIT_WEIGHTS;
  const categoryWeights = options.categoryWeights ?? NEUTRAL_CATEGORY_WEIGHTS;
  const curves: Record<string, CurveParams> = options.curves ?? MATERIAL_CURVES;
  const fallbackReplacement =
    library.find((d) => d.name === "Replacement") ?? WATERLINE_TREATMENTS.find((d) => d.name === "Replacement")!;
  const leadTimes = options.leadTimes;

  const state: SimAsset[] = assets.map((a) => ({ ...a }));
  const byId = new Map(state.map((a) => [a.id, a]));
  const history: TreatmentHistory = new Map();
  const treatmentCount = new Map<string, number>();
  const alternatives: YearAlternative[] = [];
  const trace = options.trace ? alternatives : null;
  const conditionYear = options.conditionYear ?? new Date().getFullYear();
  const startYear = options.startYear ?? conditionYear;
  const endYear = startYear + assumptions.analysisPeriodYears - 1;
  const years: DeliveryYearResult[] = [];
  const average = () => state.reduce((s, a) => s + a.condition, 0) / (state.length || 1);

  // Carry the network to the start year, exactly as the other engine does.
  const conditionYearAvgCondition = average();
  const agedYears = Math.max(0, startYear - conditionYear);
  if (agedYears > 0) {
    for (const asset of state) {
      asset.effectiveAge += agedYears;
      asset.condition = evaluateCurve(asset.curve, asset.effectiveAge);
    }
  }
  const startCondition = new Map(state.map((a) => [a.id, a.condition]));
  const startAvgCondition = average();

  const budgetFor = (year: number) =>
    assumptions.annualBudget * Math.pow(1 + assumptions.fundingGrowth, year - startYear);
  const money = ledger(budgetFor, options.fundingPlan ?? null, endYear);

  // Work an earlier pass decided: its money is out before this pass starts.
  //
  // Its segments are closed to this pass until the year that work is built.
  // Not for the whole run — the money that came back has to be able to buy
  // something — but up to then, because anything done to a segment before its
  // fixed project is built would change the network that project was judged
  // against, and this pass is not re-judging anything.
  const fixedUntil = new Map<string, number>();
  for (const commitment of fixed) {
    money.reserve(commitment);
    fixedUntil.set(commitment.assetId, Math.max(fixedUntil.get(commitment.assetId) ?? 0, commitment.buildYear));
  }

  /** What each segment currently holds, decided but not yet built. */
  const commitments = new Map<string, Commitment>();
  const built: Commitment[] = [];
  /**
   * The projects each year decided, as a live list.
   *
   * Live because work that is later superseded must come out of it: its money
   * was returned, so a run that still listed it would report a project nobody
   * ever pays for or builds — and the work plan written from the run would
   * hold it.
   */
  const programmedIn: ScenarioProject[][] = [];
  const whereProgrammed = new Map<Commitment, ScenarioProject[]>();
  /** Everything this pass holds, fixed or newly decided, for the next pass. */
  const decided: Commitment[] = [...fixed];
  for (const commitment of fixed) commitments.set(commitment.assetId, commitment);

  let totalSpend = 0;
  let totalFailureCost = 0;
  let totalFailures = 0;
  let lifecycleCostNpv = 0;

  for (let i = 0; i < assumptions.analysisPeriodYears; i++) {
    const year = startYear + i;

    // 1. Work built this year. The segment has been held since it was
    //    programmed, so the condition it was scored against is the condition it
    //    actually meets.
    let builtCount = 0;
    for (const [assetId, commitment] of [...commitments]) {
      if (commitment.buildYear !== year) continue;
      const asset = byId.get(assetId)!;
      asset.condition = commitment.conditionAfter;
      asset.effectiveAge = effectiveAgeForCondition(asset.curve, commitment.conditionAfter);
      recordTreatment(history, assetId, commitment.option, year);
      treatmentCount.set(assetId, (treatmentCount.get(assetId) ?? 0) + 1);
      commitments.delete(assetId);
      built.push(commitment);
      builtCount++;
    }

    // 2. Criticality from the network as it now stands.
    if (options.criticality) {
      for (const asset of state) {
        const rescored = options.criticality(asset.id, {
          condition: asset.condition,
          ageYears: asset.ageYears + agedYears + i,
          riskScore: pofFromCondition(asset.condition) * asset.cof,
        });
        if (rescored != null) asset.criticalityScore = rescored;
      }
    }

    // Work an earlier pass decided in this year, reported in the year that
    // decided it rather than the year this pass happens to notice it.
    const programmed: ScenarioProject[] = [];
    programmedIn.push(programmed);
    for (const commitment of fixed) {
      if (commitment.programYear === year) {
        programmed.push(commitment.project);
        whereProgrammed.set(commitment, programmed);
      }
    }

    // 3. What could be decided this year, each option judged against the
    //    segment it will meet in the year it would be built.
    const { candidates, heldCandidates } = rankCandidates({
      fixedUntil,
      state,
      assumptions,
      year,
      endYear,
      history,
      commitments,
      leadTimes,
      library,
      combinations,
      selection,
      benefitWeights,
      categoryWeights,
      curves,
      fallbackReplacement,
      trace,
    });

    // 4. Buy the best next step anywhere on the network, against every year the
    //    money would come out of.
    const outcome = selectAgainst(candidates, money.purse, heldCandidates);

    if (trace) {
      for (const candidate of candidates) {
        const reason = outcome.outcome.get(candidate) ?? NOT_SELECTED.budgetSpent;
        const step = outcome.incremental.get(candidate);
        trace.push({
          ...traceOf(candidate, year, categoryWeights),
          incremental: step?.score ?? null,
          incrementalOver: step ? (step.over?.option.label ?? null) : null,
          selected: reason === SELECTED,
          reason,
        });
      }
    }

    // 5. Record what was decided, and take back out what it superseded.
    let supersededCount = 0;
    let supersededValue = 0;
    for (const [assetId, candidate] of outcome.chosen) {
      const previous = commitments.get(assetId);
      if (previous && candidate.held === previous) continue; // unchanged
      if (previous) {
        supersededCount++;
        supersededValue += previous.cost;
        // Out of the year that decided it: the money went back when this was
        // bought, and the work will never be built.
        const list = whereProgrammed.get(previous);
        const at = list?.indexOf(previous.project) ?? -1;
        if (list && at >= 0) list.splice(at, 1);
        whereProgrammed.delete(previous);
        const was = decided.indexOf(previous);
        if (was >= 0) decided.splice(was, 1);
      }
      const commitment = toCommitment(candidate, previous ?? null);
      commitments.set(assetId, commitment);
      decided.push(commitment);
      programmed.push(commitment.project);
      whereProgrammed.set(commitment, programmed);
    }

    // 6. A year passes for everything, including what was built this year.
    for (const asset of state) {
      asset.effectiveAge += 1;
      asset.condition = evaluateCurve(asset.curve, asset.effectiveAge);
    }

    let expectedFailures = 0;
    let failureCost = 0;
    for (const asset of state) {
      const rate = annualFailureProbability(pofFromCondition(asset.condition));
      expectedFailures += rate;
      failureCost += rate * failureEventCost(asset).total;
    }

    // Backlog: the cheapest thing worth doing on every segment that holds no
    // work at all. A segment with a project in the pipeline is not backlog —
    // it is scheduled.
    const backlogBest = new Map<string, number>();
    for (const candidate of candidates) {
      if (commitments.has(candidate.assetId)) continue;
      if (!backlogBest.has(candidate.assetId)) backlogBest.set(candidate.assetId, candidate.cost);
    }
    const backlog = [...backlogBest.values()].reduce((sum, cost) => sum + cost, 0);

    const spend = money.spentIn(year);
    const avgCondition = average();
    const avgRisk = state.reduce((s, a) => s + pofFromCondition(a.condition) * a.cof, 0) / (state.length || 1);

    totalSpend += spend;
    totalFailureCost += failureCost;
    totalFailures += expectedFailures;
    lifecycleCostNpv += presentValue(spend + failureCost, i, assumptions.discountRate);

    years.push({
      year,
      budget: Math.round(budgetFor(year)),
      spend: Math.round(spend),
      treatedCount: builtCount,
      programmedCount: programmed.length,
      builtCount,
      supersededCount,
      supersededValue: Math.round(supersededValue),
      avgCondition: round1(avgCondition),
      avgRisk: round1(avgRisk),
      backlog: Math.round(backlog),
      backlogCount: backlogBest.size,
      expectedFailures: round1(expectedFailures),
      failureCost: Math.round(failureCost),
      belowTargetCount: state.filter((a) => a.condition < assumptions.conditionTarget).length,
      aboveRiskThresholdCount: state.filter(
        (a) => pofFromCondition(a.condition) * a.cof >= assumptions.riskThreshold
      ).length,
      selected: programmed,
      byCategory: money.byCategoryIn(year).map((r) => ({
        category: r.category,
        spent: Math.round(r.spent),
        cap: Math.round(r.cap),
      })),
      cappedOut: Math.round(outcome.cappedOut),
    });
  }

  // Counts last, once superseded work has been taken back out of the years
  // that decided it. What each year reports is the schedule as it finally
  // stands: what it decided, and how much of that replaced something earlier.
  for (const year of years) {
    year.programmedCount = year.selected.length;
    const replacing = year.selected.filter((p) => p.supersededTreatment != null);
    year.supersededCount = replacing.length;
    year.supersededValue = Math.round(replacing.reduce((sum, p) => sum + p.cost, 0));
  }

  const inFlight = [...commitments.values()].map((c) => ({
    assetCode: c.project.assetCode,
    treatment: c.project.treatment,
    programYear: c.programYear,
    buildYear: c.buildYear,
    cost: c.cost,
  }));

  const last = years[years.length - 1];
  const result = {
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
      startCondition: round1(startCondition.get(a.id) ?? a.condition),
      endCondition: round1(a.condition),
      treatments: treatmentCount.get(a.id) ?? 0,
    })),
    alternatives,
    agedYears,
    conditionYearAvgCondition: round1(conditionYearAvgCondition),
    startAvgCondition: round1(startAvgCondition),
    inFlight,
    inFlightCost: Math.round(inFlight.reduce((sum, w) => sum + w.cost, 0)),
    leadTimeName: leadTimes.name,
  };
  return { result, decided };
}

/** The asset as it will stand in a later year if nothing is done to it. */
function forecast(asset: SimAsset, yearsAhead: number): SimAsset {
  if (yearsAhead <= 0) return asset;
  const effectiveAge = asset.effectiveAge + yearsAhead;
  return { ...asset, effectiveAge, condition: evaluateCurve(asset.curve, effectiveAge) };
}

function isEligible(condition: number, cof: number, a: ScenarioAssumptions): boolean {
  const risk = pofFromCondition(condition) * cof;
  switch (a.strategy) {
    case "preventive":
      return condition < a.conditionTarget && condition >= 40;
    case "replacement-only":
      return condition < 45;
    case "risk-based":
      return risk >= a.riskThreshold || condition < a.conditionTarget;
    case "condition-based":
      return condition < a.conditionTarget;
    case "lowest-lifecycle-cost":
      return condition < a.conditionTarget;
  }
}

/**
 * Every option that could be decided this year, on every segment, scored
 * against the segment it would meet in the year it would be built.
 *
 * An option whose lead time puts its money past the end of the run is left
 * out here rather than scored and refused: the run has no budget to check it
 * against, and a row saying "we could have started this if the run were
 * longer" is a fact about the run's length, not about the network.
 */
function rankCandidates(args: {
  /** Segments an earlier pass decided, and the year its work is built. Closed
   * until then: anything done sooner would change the network that project was
   * judged against, and this pass is not re-judging anything. */
  fixedUntil: Map<string, number>;
  state: SimAsset[];
  assumptions: ScenarioAssumptions;
  year: number;
  endYear: number;
  history: TreatmentHistory;
  commitments: Map<string, Commitment>;
  leadTimes: LeadTimes;
  library: Parameters<typeof enumerateOptions>[1];
  combinations: Parameters<typeof enumerateOptions>[2];
  selection: Parameters<typeof filterOptions>[0];
  benefitWeights: Parameters<typeof scoreBenefits>[1];
  categoryWeights: Parameters<typeof categoryWeight>[0];
  curves: Record<string, CurveParams>;
  fallbackReplacement: Parameters<typeof buildLccaEvaluator>[4];
  trace: YearAlternative[] | null;
}): { candidates: Candidate[]; heldCandidates: Map<string, Candidate> } {
  type Pending = Omit<Candidate, "priority" | "value" | "benefit" | "terms">;
  const pending: Array<{ item: Pending; terms: BenefitTerms }> = [];
  const heldPending = new Map<string, Pending>();

  for (const asset of args.state) {
    if (args.year <= (args.fixedUntil.get(asset.id) ?? -Infinity)) continue;
    const commitment = args.commitments.get(asset.id);

    // What the segment already holds is a rung like any other: it is what a
    // larger project would have to beat, and it is re-scored here so that
    // comparison happens in this year's terms.
    if (commitment) {
      const item: Pending = {
        assetId: asset.id,
        asset,
        option: commitment.option,
        cost: commitment.cost,
        lead: { fundOffset: 0, buildOffset: commitment.buildYear - commitment.programYear, cash: [] },
        programYear: commitment.programYear,
        buildYear: commitment.buildYear,
        cash: commitment.cash,
        conditionBefore: commitment.conditionBefore,
        projectedCondition: commitment.conditionAfter,
        riskNow: commitment.riskBefore,
        riskAfter: commitment.riskAfter,
        ctx: commitment.ctx,
        held: commitment,
      };
      pending.push({ item, terms: commitment.terms });
      heldPending.set(asset.id, item);
    }

    // Options are grouped by how long they take, because a segment six years
    // from now is a different segment: enumerate, price and score against the
    // year each option would actually be built in.
    const leadsSeen = new Map<number, SimAsset>();
    const leadFor = (treatment: string, category: Parameters<typeof categoryWeight>[1]) =>
      leadTimeFor(args.leadTimes, treatment, category);

    // The whole library at this segment's current state, only to discover which
    // options exist; each is then re-judged at its own build year.
    const nowCtx = simAssetContext(asset);
    for (const shape of enumerateOptions(nowCtx, args.library, args.combinations)) {
      const lead = leadFor(shape.label, shape.category);
      if (!leadsSeen.has(lead.buildOffset)) leadsSeen.set(lead.buildOffset, forecast(asset, lead.buildOffset));
    }
    // A segment with no option at all today may still have one in six years —
    // which is the point of the whole exercise, so the long leads are tried
    // even when nothing applies now.
    for (const lead of [...Object.values(args.leadTimes.byCategory), ...Object.values(args.leadTimes.byTreatment)]) {
      if (!leadsSeen.has(lead.buildOffset)) leadsSeen.set(lead.buildOffset, forecast(asset, lead.buildOffset));
    }

    for (const [buildOffset, future] of leadsSeen) {
      const buildYear = args.year + buildOffset;
      if (!isEligible(future.condition, future.cof, args.assumptions)) continue;

      const ctx = simAssetContext(future);
      const applicable = enumerateOptions(ctx, args.library, args.combinations);
      let options = filterOptions(args.selection, applicable);
      options = options.filter((o) => o.category !== "Assess" && o.category !== "Retire");
      if (args.assumptions.strategy === "replacement-only") options = options.filter((o) => o.category === "Renew");
      // Only the options whose own lead time is the one this pass is for.
      options = options.filter((o) => leadFor(o.label, o.category).buildOffset === buildOffset);
      // The lockout is against the year the work would be done.
      options = options.filter((o) => !withinInterval(args.history, asset.id, o, buildYear));
      if (options.length === 0) continue;

      const pof = ctx.pof ?? pofFromCondition(future.condition);
      const riskNow = pof * future.cof;
      const cofNoCriticality = benefitCof({
        customersServed: future.customersServed,
        criticality: future.criticality,
        diameterInches: future.diameterInches,
        customerType: future.customerType,
      });
      const lcca = buildLccaEvaluator(ctx, future.condition, args.library, args.curves, args.fallbackReplacement);

      for (const option of options) {
        const lead = leadFor(option.label, option.category);
        const cash = cashPlan(lead, args.year, option.cost);
        // Money the run has no budget for: not programmed, not reported as
        // refused, because there is nothing to refuse it against.
        if (cash.some((c) => c.year > args.endYear)) continue;

        const riskAfter =
          option.failureProbMultiplier === 0 ? 0 : Math.max(1, pof * option.failureProbMultiplier) * future.cof;

        pending.push({
          item: {
            assetId: asset.id,
            asset,
            option,
            cost: option.cost,
            lead,
            programYear: args.year,
            buildYear,
            cash,
            conditionBefore: future.condition,
            projectedCondition: option.projectedCondition,
            riskNow,
            riskAfter,
            ctx,
            held: null,
          },
          terms: optionTerms(option, ctx, cofNoCriticality, lcca ? lcca.savingFor(option) : 0),
        });
      }
    }
  }

  const scored = scoreBenefits(pending, args.benefitWeights).map<Candidate>((s) => {
    const weight = categoryWeight(args.categoryWeights, s.item.option.category);
    return {
      ...s.item,
      terms: s.raw,
      benefit: s.benefit,
      value: s.item.asset.criticalityScore * s.item.asset.scaleFactor * weight * s.benefit,
      priority: priorityScore({
        criticality: s.item.asset.criticalityScore,
        scaleFactor: s.item.asset.scaleFactor,
        categoryWeight: weight,
        benefit: s.benefit,
        totalCost: s.item.cost,
      }),
    };
  });

  const riskPct = (c: Candidate) => (c.riskNow > 0 ? ((c.riskNow - c.riskAfter) / c.riskNow) * 100 : null);
  const fundable = scored.filter((c) => {
    // Work already held is kept whatever it now scores: it is paid for, and
    // dropping it here would silently lose a commitment rather than replace it.
    if (c.held) return true;
    const enough =
      c.projectedCondition >= args.assumptions.conditionTarget || (riskPct(c) ?? 0) >= MIN_RISK_REDUCTION_PCT;
    const clears = clearsEffectivenessFloor(c.conditionBefore, riskPct(c));
    if (enough && clears) return true;
    if (args.trace) {
      args.trace.push({
        ...traceOf(c, args.year, args.categoryWeights),
        incremental: null,
        incrementalOver: null,
        selected: false,
        reason: enough ? NOT_RANKED.belowFloor : NOT_RANKED.tooLittle,
      });
    }
    return false;
  });

  const heldCandidates = new Map<string, Candidate>();
  for (const candidate of fundable) if (candidate.held) heldCandidates.set(candidate.assetId, candidate);

  return {
    candidates: fundable.sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1)),
    heldCandidates,
  };
}

function toCommitment(candidate: Candidate, superseded: Commitment | null): Commitment {
  const isBundle = candidate.option.members.length > 1;
  const shares = isBundle ? splitOptionCost(candidate.option, candidate.ctx) : [Math.round(candidate.cost)];

  const project: ScenarioProject = {
    assetId: candidate.assetId,
    assetCode: candidate.asset.assetCode,
    treatment: candidate.option.label,
    category: candidate.option.category,
    cost: Math.round(candidate.cost),
    members: candidate.option.members.map((m, i) => ({ treatment: m.name, cost: shares[i] ?? 0 })),
    bundleName: isBundle ? candidate.option.label : null,
    conditionBefore: round1(candidate.conditionBefore),
    conditionAfter: round1(candidate.projectedCondition),
    riskBefore: round1(candidate.riskNow),
    riskAfter: round1(candidate.riskAfter),
    priority: candidate.priority,
    incremental: null,
    incrementalOver: null,
    criticality: round1(candidate.asset.criticalityScore),
    scaleFactor: Math.round(candidate.asset.scaleFactor * 100) / 100,
    benefit: round1(candidate.benefit),
    programmedYear: candidate.programYear,
    // The year most of the money leaves, not the first year any of it does.
    // A plan row sits in one year, and for a cost split 10% now and 90% at
    // construction, the year that matters to a budget is the 90%.
    fundedYear: candidate.cash.reduce((a, b) => (b.amount > a.amount ? b : a), candidate.cash[0]).year,
    buildYear: candidate.buildYear,
    cash: candidate.cash,
    supersededTreatment: superseded?.project.treatment ?? null,
  };

  return {
    assetId: candidate.assetId,
    option: candidate.option,
    cost: candidate.cost,
    programYear: candidate.programYear,
    buildYear: candidate.buildYear,
    cash: candidate.cash,
    conditionBefore: candidate.conditionBefore,
    conditionAfter: candidate.projectedCondition,
    riskBefore: candidate.riskNow,
    riskAfter: candidate.riskAfter,
    ctx: candidate.ctx,
    terms: candidate.terms,
    project,
  };
}

function traceOf(
  c: Candidate,
  year: number,
  weights: Parameters<typeof categoryWeight>[0]
): Omit<YearAlternative, "selected" | "reason" | "incremental" | "incrementalOver"> {
  return {
    year,
    assetId: c.assetId,
    assetCode: c.asset.assetCode,
    conditionBefore: round1(c.conditionBefore),
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
