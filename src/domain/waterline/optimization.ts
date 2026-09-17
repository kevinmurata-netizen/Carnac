// Optimization / prioritization (SPEC §16): the four objectives a utility
// weighs, and what a named weighting holds.
//
// The scoring that used to live here — a weighted sum over all four, min-max
// normalized across the candidate set — was the work plan's own ranking, and
// the work plan was the only thing that used it. It is gone: plans and
// scenarios now score the same way, through ./benefit.ts, where the first
// three objectives become Expected Benefit and criticality moves to the
// multiplier it always was in the Priority Score (§5.3, §5.4).
//
// What remains is the shape of a weighting: the keys, their labels and
// descriptions for the editor, and the normalization that makes 30/40/20/10
// and 3/4/2/1 the same policy.

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

