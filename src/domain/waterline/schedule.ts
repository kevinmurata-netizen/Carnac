import { evaluateCurve, effectiveAgeForCondition } from "./deterioration";
import { annualFailureProbability, failureEventCost, presentValue } from "./lcca";
import { buildOption, type TreatmentDef } from "./treatment";
import { pofFromCondition, simAssetContext, type ScenarioAssumptions, type SimAsset } from "./scenario";

/**
 * Running a work plan exactly as it is written.
 *
 * A scenario decides what to buy; a plan is what someone decided to do. So
 * this chooses nothing: it applies each scheduled visit in the year it sits
 * in, ages the network a year, and reports what that produced. Moving a
 * relining from 2027 to 2031 therefore shows up as four more years of
 * deterioration and whatever that costs in failures — which is the question
 * moving it asks.
 *
 * Budgets are reported against, not enforced. A year can be scheduled over its
 * money; that is a legitimate thing to plan and then argue for, and hiding it
 * by refusing the edit would only move the argument off the screen.
 */

/** One visit: everything done to one segment in one year, together. */
export type ScheduledVisit = {
  year: number;
  assetId: string;
  /** Treatment names applied in the same visit. Several means one bundle:
   * mobilization is charged once, exactly as a combination is. */
  treatments: string[];
  /** What the plan holds as the cost of this visit. Used for spend rather than
   * re-pricing, so the money reported is the money the plan shows. */
  cost: number;
};

export type ScheduleYearResult = {
  year: number;
  budget: number;
  spend: number;
  /** Scheduled beyond the year's budget. Allowed, and said plainly. */
  overBudget: boolean;
  treatedCount: number;
  avgCondition: number;
  avgRisk: number;
  expectedFailures: number;
  failureCost: number;
  belowTargetCount: number;
};

/** A visit the run could not carry out, and why — never silently dropped. */
export type SkippedVisit = {
  year: number;
  assetId: string;
  treatments: string[];
  reason: string;
};

export type ScheduleRunResult = {
  years: ScheduleYearResult[];
  totalSpend: number;
  totalFailures: number;
  totalFailureCost: number;
  lifecycleCostNpv: number;
  finalAvgCondition: number;
  startAvgCondition: number;
  appliedCount: number;
  skipped: SkippedVisit[];
};

export function runSchedule(
  assets: SimAsset[],
  assumptions: ScenarioAssumptions,
  visits: ScheduledVisit[],
  options: {
    library: TreatmentDef[];
    /** The first year of the plan. */
    startYear: number;
    /** How many years to walk, which is the plan's own span. */
    years: number;
  }
): ScheduleRunResult {
  // Copies, so running a plan never disturbs the caller's network.
  const state: SimAsset[] = assets.map((a) => ({ ...a }));
  const byId = new Map(state.map((a) => [a.id, a]));
  const byYear = new Map<number, ScheduledVisit[]>();
  for (const visit of visits) byYear.set(visit.year, [...(byYear.get(visit.year) ?? []), visit]);

  const average = () => state.reduce((sum, a) => sum + a.condition, 0) / (state.length || 1);
  const startAvgCondition = average();
  const results: ScheduleYearResult[] = [];
  const skipped: SkippedVisit[] = [];
  let appliedCount = 0;
  let totalSpend = 0;
  let totalFailures = 0;
  let totalFailureCost = 0;
  let lifecycleCostNpv = 0;

  for (let i = 0; i < options.years; i++) {
    const year = options.startYear + i;
    const budget = assumptions.annualBudget * Math.pow(1 + assumptions.fundingGrowth, i);
    let spend = 0;
    const treated = new Set<string>();

    for (const visit of byYear.get(year) ?? []) {
      const asset = byId.get(visit.assetId);
      if (!asset) {
        skipped.push({ ...visit, reason: "That segment is no longer in the network" });
        continue;
      }

      const members = visit.treatments.flatMap((name) => {
        const def = options.library.find((d) => d.name === name);
        return def ? [def] : [];
      });
      if (members.length !== visit.treatments.length) {
        skipped.push({ ...visit, reason: "A treatment in this visit is no longer in the library" });
        continue;
      }

      // Priced against the segment as this year finds it, which is what says
      // whether the work still does what the plan expected. The cost reported
      // is the plan's own, so the money on screen is the money it holds.
      const ctx = simAssetContext(asset);
      const label = members.map((m) => m.name).join(" + ");
      const option = buildOption(`plan:${visit.assetId}:${year}`, label, members, ctx);
      if (!option) {
        skipped.push({ ...visit, reason: "No price applies to this segment, so the work cannot be costed" });
        continue;
      }

      asset.condition = option.projectedCondition;
      asset.effectiveAge = effectiveAgeForCondition(asset.curve, option.projectedCondition);
      spend += visit.cost;
      treated.add(visit.assetId);
      appliedCount++;
    }

    // A year passes for everything, including what was just treated — the same
    // rule a scenario follows, so the two are comparable.
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

    totalSpend += spend;
    totalFailures += expectedFailures;
    totalFailureCost += failureCost;
    lifecycleCostNpv += presentValue(spend + failureCost, i, assumptions.discountRate);

    results.push({
      year,
      budget: Math.round(budget),
      spend: Math.round(spend),
      overBudget: spend > budget + 1,
      treatedCount: treated.size,
      avgCondition: Math.round(average() * 10) / 10,
      avgRisk:
        Math.round((state.reduce((s, a) => s + pofFromCondition(a.condition) * a.cof, 0) / (state.length || 1)) * 10) /
        10,
      expectedFailures: Math.round(expectedFailures * 10) / 10,
      failureCost: Math.round(failureCost),
      belowTargetCount: state.filter((a) => a.condition < assumptions.conditionTarget).length,
    });
  }

  return {
    years: results,
    totalSpend: Math.round(totalSpend),
    totalFailures: Math.round(totalFailures),
    totalFailureCost: Math.round(totalFailureCost),
    lifecycleCostNpv: Math.round(lifecycleCostNpv),
    finalAvgCondition: results[results.length - 1]?.avgCondition ?? Math.round(average() * 10) / 10,
    startAvgCondition: Math.round(startAvgCondition * 10) / 10,
    appliedCount,
    skipped,
  };
}
