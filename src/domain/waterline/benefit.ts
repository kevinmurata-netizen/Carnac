// Expected Benefit and the Criticality × Benefit ÷ Cost ranking.
// See docs/TREATMENT-MODEL-REBUILD.md §5.3, which this implements.
//
// The shape of the formula is the whole argument: Expected Benefit is what a
// treatment *achieves*, Criticality is what the asset is *worth*, and the two
// are multiplied once. That only works if criticality is absent from the
// benefit side — otherwise the product is roughly criticality squared and
// large mains dominate for a reason no reader can see.

import { COF_WEIGHTS, combineFactors, computeCofFactors, type CofInputs } from "./risk";

/**
 * The COF weighting used for benefit, with the Criticality factor removed.
 *
 * No renormalization is written here because none is needed: `combineFactors`
 * divides by the sum of the weights it is given, so dropping one to zero
 * rescales the rest on its own — customers served 0.35 → 0.50, diameter
 * 0.20 → 0.286, customer type 0.15 → 0.214.
 *
 * Customers served and customer type deliberately stay. They describe how much
 * a failure hurts, which is part of what a treatment averts. Only Criticality
 * moves to the multiplier, because only it is applied there.
 */
export const BENEFIT_COF_WEIGHTS = { ...COF_WEIGHTS, CRITICALITY: 0 };

/** Consequence of failure with criticality taken out, 1–5. */
export function benefitCof(inputs: CofInputs): number {
  return combineFactors(computeCofFactors(inputs, BENEFIT_COF_WEIGHTS));
}

/** The three things a treatment achieves, in their natural units. */
export type BenefitTerms = {
  /** WCI points restored. */
  conditionImprovement: number;
  /** Criticality-free risk points removed. */
  riskReduction: number;
  /** Life-cycle cost avoided versus leaving the asset alone, in dollars. */
  lifeCycleSaving: number;
};

export type BenefitWeights = {
  conditionImprovement: number;
  riskReduction: number;
  lifeCycleSaving: number;
};

/** Today's shipped weighting with criticality's 0.10 absent; normalization
 * redistributes it in proportion, so a run that changes nothing gets the
 * closest available analogue of the existing ranking. */
export const DEFAULT_BENEFIT_WEIGHTS: BenefitWeights = {
  conditionImprovement: 0.3,
  riskReduction: 0.4,
  lifeCycleSaving: 0.2,
};

const TERM_KEYS = ["conditionImprovement", "riskReduction", "lifeCycleSaving"] as const;
export type BenefitTermKey = (typeof TERM_KEYS)[number];

export const BENEFIT_LABELS: Record<BenefitTermKey, string> = {
  conditionImprovement: "Condition Improvement",
  riskReduction: "Risk Reduction",
  lifeCycleSaving: "Life-Cycle Saving",
};

/** Normalized to sum to 1, so 30/40/20 and 3/4/2 score identically. Falls back
 * to the defaults rather than dividing by zero — the caller is expected to
 * have refused an all-zero set before reaching here. */
export function normalizeBenefitWeights(weights: BenefitWeights): BenefitWeights {
  const total = TERM_KEYS.reduce((sum, k) => sum + Math.max(0, weights[k]), 0);
  if (total <= 0) return { ...DEFAULT_BENEFIT_WEIGHTS };
  return TERM_KEYS.reduce((acc, k) => {
    acc[k] = Math.max(0, weights[k]) / total;
    return acc;
  }, {} as BenefitWeights);
}

export type ScoredBenefit<T> = {
  item: T;
  raw: BenefitTerms;
  /** Each term rescaled 0–100 across the whole set. */
  normalized: BenefitTerms;
  /** normalized × weight, so the total can be decomposed. */
  contributions: BenefitTerms;
  /** Weighted total, 0–100. */
  benefit: number;
};

/**
 * Min-max normalize each term across **every option on every asset**, then
 * take the weighted average.
 *
 * The set matters as much as the arithmetic. Normalizing per asset would make
 * benefit incomparable between assets, and the work plan already suffers from
 * two different notions of "best" — `buildCandidates` picks one option per
 * asset by life-cycle saving while the optimizer ranks assets by a weighted
 * sum, which is why a bundle could win 80 recommendations and reach the plan
 * zero times. One set means one answer to both questions.
 *
 * The cost of min-max is that scores are relative to the run: adding one
 * extreme asset rescales everyone. That is already true of `scoreCandidates`,
 * so it is not a new property — but a benefit score should not be stored and
 * compared against a later run's as though it were absolute.
 */
export function scoreBenefits<T>(
  items: Array<{ item: T; terms: BenefitTerms }>,
  weights: BenefitWeights
): Array<ScoredBenefit<T>> {
  const w = normalizeBenefitWeights(weights);
  if (items.length === 0) return [];

  const ranges = TERM_KEYS.reduce(
    (acc, key) => {
      const values = items.map((c) => c.terms[key]);
      acc[key] = { min: Math.min(...values), max: Math.max(...values) };
      return acc;
    },
    {} as Record<BenefitTermKey, { min: number; max: number }>
  );

  return items.map(({ item, terms }) => {
    const normalized = {} as BenefitTerms;
    const contributions = {} as BenefitTerms;
    let benefit = 0;

    for (const key of TERM_KEYS) {
      const { min, max } = ranges[key];
      const span = max - min;
      // Every candidate scoring the same on a term means that term carries no
      // information for this decision, so it scores zero for everyone rather
      // than an arbitrary constant.
      const n = span > 0 ? ((terms[key] - min) / span) * 100 : 0;
      normalized[key] = Math.round(n * 10) / 10;
      const contribution = n * w[key];
      contributions[key] = Math.round(contribution * 10) / 10;
      benefit += contribution;
    }

    return { item, raw: terms, normalized, contributions, benefit: Math.round(benefit * 10) / 10 };
  });
}

export type CostBasis = "per foot" | "per asset";

/**
 * Cost per unit, and what the unit turned out to be.
 *
 * A segment with no recorded length cannot be priced per foot, and dividing by
 * zero would rank it infinitely well. It falls back to cost per asset and says
 * so, following `criticality-formula.ts` in returning a defensible value
 * rather than an impossible one.
 */
export function costPerUnit(cost: number, lengthFt: number | null): { value: number; basis: CostBasis } {
  if (lengthFt != null && lengthFt > 0) {
    return { value: Math.round((cost / lengthFt) * 100) / 100, basis: "per foot" };
  }
  return { value: cost, basis: "per asset" };
}

/**
 * `Criticality × Expected Benefit ÷ Cost per Unit`.
 *
 * An ordinal ranking figure, not a rate of return and not a currency: it orders
 * a candidate set and means nothing on its own. Callers should not print it
 * without the decomposition beside it.
 */
export function rankingValue(criticality: number, benefit: number, unitCost: number): number | null {
  if (!Number.isFinite(unitCost) || unitCost <= 0) return null;
  return Math.round(((criticality * benefit) / unitCost) * 100) / 100;
}

/** Why a candidate ranked where it did, in the terms it was ranked by. */
export function explainBenefit(
  scored: Pick<ScoredBenefit<unknown>, "benefit" | "contributions">,
  weights: BenefitWeights
): string {
  const w = normalizeBenefitWeights(weights);
  const parts = TERM_KEYS.filter((k) => w[k] > 0).map(
    (k) => `${BENEFIT_LABELS[k]} ${scored.contributions[k]} pts (weight ${Math.round(w[k] * 100)}%)`
  );
  return `Benefit ${scored.benefit}/100 — ${parts.join(", ")}.`;
}
