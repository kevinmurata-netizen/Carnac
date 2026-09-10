// Expected Benefit and the Criticality × Benefit ÷ Cost ranking.
// See docs/TREATMENT-MODEL-REBUILD.md §5.3 (Expected Benefit) and §5.4
// (the Priority Score), which this implements.
//
// The shape of the formula is the whole argument: Expected Benefit is what a
// treatment *achieves*, Criticality is what the asset is *worth*, and the two
// are multiplied once. That only works if criticality is absent from the
// benefit side — otherwise the product is roughly criticality squared and
// large mains dominate for a reason no reader can see.

import { COF_WEIGHTS, combineFactors, computeCofFactors, type CofInputs } from "./risk";
import type { TreatmentOption } from "./treatment";

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

/**
 * What one option achieves on one asset, in natural units.
 *
 * Written once and shared, because two call sites computing "risk points
 * removed" slightly differently is exactly the kind of divergence nobody
 * notices until two screens disagree about the same treatment.
 *
 * `lifeCycleSaving` arrives as a number rather than being worked out here: it
 * needs the LCCA evaluator, which needs deterioration curves and the database,
 * and none of that belongs in the domain.
 */
export function optionTerms(
  option: TreatmentOption,
  ctx: { conditionScore: number | null; pof: number | null },
  cofWithoutCriticality: number,
  lifeCycleSaving: number
): BenefitTerms {
  const conditionNow = ctx.conditionScore ?? 0;
  const conditionImprovement = Math.max(0, option.projectedCondition - conditionNow);

  // Recomputed against the criticality-free consequence rather than read off
  // the stored risk score, so criticality is not counted twice — once here and
  // once as the multiplier. §5.3.
  const pof = ctx.pof ?? 0;
  const riskNow = pof * cofWithoutCriticality;
  // A treatment that removes the asset entirely removes all of its risk; every
  // other one leaves a floor, because a pipe in the ground can always fail.
  const riskAfter =
    option.failureProbMultiplier === 0 ? 0 : Math.max(1, pof * option.failureProbMultiplier) * cofWithoutCriticality;

  return {
    conditionImprovement,
    riskReduction: Math.max(0, riskNow - riskAfter),
    lifeCycleSaving: Math.max(0, lifeCycleSaving),
  };
}

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

/** Every term behind one Priority Score, kept together so the number can
 * always be decomposed into the five things that produced it. */
export type PriorityTerms = {
  /** What the asset is worth, 0-100. */
  criticality: number;
  /** How big a piece of work this is. A multiplier, unclamped. */
  scaleFactor: number;
  /** How far the scenario leans toward this kind of work. 1 is neutral. */
  categoryWeight: number;
  /** What the treatment achieves, 0-100. */
  benefit: number;
  /** The option's own price, in dollars. */
  totalCost: number;
};

/**
 * `Criticality × Scale Factor × Category Weight × Expected Benefit ÷ Total Cost`.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.4, which this implements.
 *
 * An ordinal ranking figure — not a rate of return, not a currency. It orders a
 * candidate set and means nothing on its own, so callers should not print it
 * without the decomposition beside it.
 *
 * Null rather than Infinity when the cost is zero or missing. A free option
 * would otherwise rank above every real one, and "we could not price this"
 * is not the same statement as "this is the best thing to do".
 */
export function priorityScore(terms: PriorityTerms): number | null {
  const { criticality, scaleFactor, categoryWeight, benefit, totalCost } = terms;
  if (!Number.isFinite(totalCost) || totalCost <= 0) return null;

  const raw = (criticality * scaleFactor * categoryWeight * benefit) / totalCost;
  if (!Number.isFinite(raw)) return null;
  return Math.round(raw * 10000) / 10000;
}

/** Why one option scored what it did, in the terms it was scored by. */
export function explainPriority(terms: PriorityTerms, score: number | null): string {
  if (score == null) {
    return "No priority score — this option could not be priced, so there is nothing to divide by.";
  }
  const parts = [
    `criticality ${Math.round(terms.criticality * 10) / 10}`,
    `scale ${Math.round(terms.scaleFactor * 100) / 100}`,
    ...(terms.categoryWeight === 1 ? [] : [`category ×${terms.categoryWeight}`]),
    `benefit ${terms.benefit}`,
  ];
  return `Priority ${score} — ${parts.join(" × ")} ÷ $${Math.round(terms.totalCost).toLocaleString("en-US")}.`;
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
