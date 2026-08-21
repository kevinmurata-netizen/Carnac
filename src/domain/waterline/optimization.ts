// Optimization / prioritization (SPEC §16).
//
// "The goal is not simply to find assets in poor condition" — it is the best
// use of limited funds. So candidates are scored on several objectives at
// once, with weights the user controls, and every score can be decomposed
// back into the contribution of each objective. §16 explicitly rules out a
// black-box algorithm, so this is a published weighted sum over normalized
// objective values — nothing hidden, and reproducible by hand.

export type ObjectiveKey = "conditionImprovement" | "riskReduction" | "lifeCycleCost" | "criticality";

export type ObjectiveWeights = Record<ObjectiveKey, number>;

/** The spec's worked example (§16) is the shipped default. */
export const DEFAULT_WEIGHTS: ObjectiveWeights = {
  conditionImprovement: 0.3,
  riskReduction: 0.4,
  lifeCycleCost: 0.2,
  criticality: 0.1,
};

export const OBJECTIVE_LABELS: Record<ObjectiveKey, string> = {
  conditionImprovement: "Condition Improvement",
  riskReduction: "Risk Reduction",
  lifeCycleCost: "Life Cycle Cost",
  criticality: "Criticality",
};

export const OBJECTIVE_DESCRIPTIONS: Record<ObjectiveKey, string> = {
  conditionImprovement: "How many WCI points the treatment restores.",
  riskReduction: "How many risk points (probability × consequence) it removes.",
  lifeCycleCost: "Life-cycle cost avoided versus leaving the asset alone.",
  criticality: "How much the asset matters — customers served, critical facilities, redundancy.",
};

export const OBJECTIVE_KEYS: ObjectiveKey[] = [
  "conditionImprovement",
  "riskReduction",
  "lifeCycleCost",
  "criticality",
];

/** Weights are normalized so they always sum to 1; a user entering 30/40/20/10
 * and a user entering 3/4/2/1 get the same ranking. */
export function normalizeWeights(weights: ObjectiveWeights): ObjectiveWeights {
  const total = OBJECTIVE_KEYS.reduce((sum, k) => sum + Math.max(0, weights[k]), 0);
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  return OBJECTIVE_KEYS.reduce((acc, k) => {
    acc[k] = Math.max(0, weights[k]) / total;
    return acc;
  }, {} as ObjectiveWeights);
}

/** Raw objective values for one candidate, in their natural units. */
export type ObjectiveValues = Record<ObjectiveKey, number>;

export type ScoredCandidate<T> = {
  item: T;
  raw: ObjectiveValues;
  /** Each objective rescaled 0-100 across the candidate set. */
  normalized: ObjectiveValues;
  /** normalized × weight, per objective — this is what makes the total
   * explainable ("risk reduction contributed 28 of the 61 points"). */
  contributions: ObjectiveValues;
  /** Weighted total, 0-100. */
  priorityScore: number;
};

/**
 * Min-max normalize each objective across the whole candidate set, then take
 * the weighted sum. Min-max (rather than z-score) keeps the output on a plain
 * 0-100 scale that a reader can interpret without knowing the distribution.
 *
 * When every candidate has the same value for an objective, that objective
 * carries no information for this decision, so it scores 0 for everyone
 * rather than an arbitrary constant.
 */
export function scoreCandidates<T>(
  candidates: Array<{ item: T; raw: ObjectiveValues }>,
  weights: ObjectiveWeights
): Array<ScoredCandidate<T>> {
  const w = normalizeWeights(weights);
  if (candidates.length === 0) return [];

  const ranges = OBJECTIVE_KEYS.reduce(
    (acc, key) => {
      const values = candidates.map((c) => c.raw[key]);
      acc[key] = { min: Math.min(...values), max: Math.max(...values) };
      return acc;
    },
    {} as Record<ObjectiveKey, { min: number; max: number }>
  );

  return candidates.map(({ item, raw }) => {
    const normalized = {} as ObjectiveValues;
    const contributions = {} as ObjectiveValues;
    let priorityScore = 0;

    for (const key of OBJECTIVE_KEYS) {
      const { min, max } = ranges[key];
      const span = max - min;
      const n = span > 0 ? ((raw[key] - min) / span) * 100 : 0;
      normalized[key] = Math.round(n * 10) / 10;
      const contribution = n * w[key];
      contributions[key] = Math.round(contribution * 10) / 10;
      priorityScore += contribution;
    }

    return {
      item,
      raw,
      normalized,
      contributions,
      priorityScore: Math.round(priorityScore * 10) / 10,
    };
  });
}

/** Human-readable justification for why an item ranked where it did. */
export function explainPriority(
  scored: Pick<ScoredCandidate<unknown>, "priorityScore" | "contributions" | "raw">,
  weights: ObjectiveWeights
): string {
  const w = normalizeWeights(weights);
  const ordered = OBJECTIVE_KEYS.slice().sort((a, b) => scored.contributions[b] - scored.contributions[a]);
  const parts = ordered
    .filter((k) => w[k] > 0)
    .map((k) => `${OBJECTIVE_LABELS[k]} ${scored.contributions[k]} pts (weight ${Math.round(w[k] * 100)}%)`);
  return `Priority ${scored.priorityScore}/100 — ${parts.join(", ")}.`;
}
