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
  MATERIAL_CURVES,
  DEFAULT_CURVE,
  evaluateCurve,
  effectiveAgeForCondition,
  type CurveParams,
} from "./deterioration";
import { annualFailureProbability, failureEventCost, presentValue } from "./lcca";
import {
  WATERLINE_TREATMENTS,
  isApplicable,
  estimateTreatmentCost,
  projectedConditionAfter,
  type AssetTreatmentContext,
  type TreatmentDef,
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
};

/** `curves` is injected so forecasts run against the deterioration models
 * configured in Settings; it defaults to the seeded material curves. */
export function curveFor(
  material: string | null,
  curves: Record<string, CurveParams> = MATERIAL_CURVES
): CurveParams {
  return (material && curves[material]) || DEFAULT_CURVE;
}

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
  asset: SimAsset;
  def: TreatmentDef;
  cost: number;
  projectedCondition: number;
  riskNow: number;
  riskAfter: number;
  riskReduction: number;
  riskReductionPerDollar: number;
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
  };
}

/** The single treatment this strategy would apply to this asset, if any. */
function candidateFor(
  asset: SimAsset,
  assumptions: ScenarioAssumptions,
  library: TreatmentDef[]
): Candidate | null {
  const strategy = assumptions.strategy;
  const ctx = buildContext(asset);
  let applicable = library.filter(
    (def) => def.category !== "Assess" && def.category !== "Retire" && isApplicable(def, ctx)
  );

  if (strategy === "replacement-only") {
    applicable = applicable.filter((def) => def.category === "Renew");
  }
  if (applicable.length === 0) return null;

  const pof = ctx.pof ?? pofFromCondition(asset.condition);
  const riskNow = pof * asset.cof;

  // Pick the most cost-effective qualifying treatment for this asset; the
  // strategy then decides which *assets* get funded.
  const scored = applicable.map((def) => {
    const cost = estimateTreatmentCost(def, { lengthFt: asset.lengthFt, diameterInches: asset.diameterInches });
    const projectedCondition = projectedConditionAfter(def, asset.condition);
    const riskAfter = Math.max(1, pof * def.failureProbMultiplier) * asset.cof;
    const riskReduction = Math.max(0, riskNow - riskAfter);
    return {
      asset,
      def,
      cost,
      projectedCondition,
      riskNow,
      riskAfter,
      riskReduction,
      riskReductionPerDollar: cost > 0 ? riskReduction / cost : 0,
    };
  });

  // A treatment only counts as addressing a below-target asset if it either
  // lifts it to the target or cuts risk materially. Without this, per-dollar
  // ranking always picks a ~$5k patch that adds +3 condition, so a
  // well-funded scenario perpetually patches instead of renewing and its
  // budget goes unspent while the network slowly decays.
  const meaningful = scored.filter(
    (s) => s.projectedCondition >= assumptions.conditionTarget || s.riskReduction / (s.riskNow || 1) >= 0.25
  );
  const pool = meaningful.length > 0 ? meaningful : scored;

  return pool.sort((a, b) => b.riskReductionPerDollar - a.riskReductionPerDollar)[0];
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

function prioritize(candidates: Candidate[], strategy: Strategy): Candidate[] {
  const sorted = [...candidates];
  switch (strategy) {
    case "risk-based":
      sorted.sort((a, b) => b.riskNow - a.riskNow);
      break;
    case "condition-based":
      sorted.sort((a, b) => a.asset.condition - b.asset.condition);
      break;
    case "lowest-lifecycle-cost":
      sorted.sort((a, b) => b.riskReductionPerDollar - a.riskReductionPerDollar);
      break;
    case "replacement-only":
      sorted.sort((a, b) => b.riskNow - a.riskNow);
      break;
    case "preventive":
      // Cheapest effective intervention first — treat more assets earlier.
      sorted.sort((a, b) => a.cost - b.cost);
      break;
  }
  return sorted;
}

export function runScenario(
  assets: SimAsset[],
  assumptions: ScenarioAssumptions,
  library: TreatmentDef[] = WATERLINE_TREATMENTS
): ScenarioRunResult {
  // Work on copies so a scenario run never mutates caller state.
  const state: SimAsset[] = assets.map((a) => ({ ...a }));
  const startYear = new Date().getFullYear();
  const years: ScenarioYearResult[] = [];

  let totalSpend = 0;
  let totalFailureCost = 0;
  let totalFailures = 0;
  let lifecycleCostNpv = 0;

  for (let i = 0; i < assumptions.analysisPeriodYears; i++) {
    const year = startYear + i;
    const budget = assumptions.annualBudget * Math.pow(1 + assumptions.fundingGrowth, i);

    // 1. Identify this year's candidate work.
    const candidates: Candidate[] = [];
    for (const asset of state) {
      if (!isEligible(asset, assumptions)) continue;
      const candidate = candidateFor(asset, assumptions, library);
      if (candidate) candidates.push(candidate);
    }

    // 2. Fund down the priority list until the budget is exhausted.
    const ordered = prioritize(candidates, assumptions.strategy);
    let spend = 0;
    let treatedCount = 0;
    const treated = new Set<string>();
    const selected: ScenarioProject[] = [];
    for (const candidate of ordered) {
      if (spend + candidate.cost > budget) continue; // skip; may fit a cheaper one
      spend += candidate.cost;
      treatedCount++;
      treated.add(candidate.asset.id);
      selected.push({
        assetId: candidate.asset.id,
        assetCode: candidate.asset.assetCode,
        treatment: candidate.def.name,
        category: candidate.def.category,
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

    // 5. Unfunded-but-needed work becomes backlog.
    const backlogItems = ordered.filter((c) => !treated.has(c.asset.id));
    const backlog = backlogItems.reduce((sum, c) => sum + c.cost, 0);

    const avgCondition = state.reduce((s, a) => s + a.condition, 0) / (state.length || 1);
    const avgRisk =
      state.reduce((s, a) => s + pofFromCondition(a.condition) * a.cof, 0) / (state.length || 1);

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
      backlogCount: backlogItems.length,
      expectedFailures: Math.round(expectedFailures * 10) / 10,
      failureCost: Math.round(failureCost),
      belowTargetCount: state.filter((a) => a.condition < assumptions.conditionTarget).length,
      aboveRiskThresholdCount: state.filter(
        (a) => pofFromCondition(a.condition) * a.cof >= assumptions.riskThreshold
      ).length,
      selected,
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
