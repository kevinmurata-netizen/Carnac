// Waterline Condition Index (WCI): a transparent, explainable 0-100 composite
// score. This is intentionally a simple weighted average of inspection
// component scores — not a black-box model — per the "explainability" and
// "transparent models first" requirements. Weights and bands are stored on
// the ConditionModel row (formula/bands columns) at seed time from this file,
// so the numbers below are the source of truth but the *mechanism* for
// applying them is data-driven, not hard-coded into UI components.

/**
 * Seed weights. Once an organization exists these live on its ConditionModel
 * row and are edited through Administration → Condition Index; this constant
 * is only the starting point written at seed time, and the fallback for code
 * paths that run without an organization in hand.
 */
export const WCI_COMPONENT_WEIGHTS: Record<string, number> = {
  STRUCTURAL_DAMAGE: 0.18,
  CORROSION: 0.14,
  LEAKAGE: 0.14,
  JOINT_DETERIORATION: 0.1,
  INTERNAL_CONDITION: 0.1,
  EXTERNAL_DAMAGE: 0.08,
  COATING_CONDITION: 0.08,
  SEDIMENT_DEPOSITION: 0.06,
  PRESSURE_ISSUES: 0.06,
  GROUND_MOVEMENT: 0.03,
  CATHODIC_PROTECTION: 0.03,
};

export type ConditionBand = {
  label: string;
  min: number;
  max: number;
  color: string;
};

export const WCI_BANDS: ConditionBand[] = [
  { label: "Excellent", min: 85, max: 100, color: "#16a34a" },
  { label: "Good", min: 70, max: 84, color: "#65a30d" },
  { label: "Fair", min: 50, max: 69, color: "#eab308" },
  { label: "Poor", min: 25, max: 49, color: "#f97316" },
  { label: "Very Poor", min: 0, max: 24, color: "#dc2626" },
];

export const WCI_MODEL_NAME = "Waterline Condition Index (WCI)";

/** Weighted average of 0-10 component scores, scaled to 0-100. Components
 * missing from `scores` are excluded and remaining weights renormalized, so
 * the formula degrades gracefully if a future template makes a field optional.
 *
 * Renormalizing also means `weights` need not sum to 1 — an administrator can
 * enter 18/14/14/… or 3/2/2/… and get the same index.
 */
export function computeWCI(
  scores: Record<string, number>,
  weights: Record<string, number> = WCI_COMPONENT_WEIGHTS
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [code, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const score = scores[code];
    if (score == null) continue;
    weightedSum += score * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round(((weightedSum / totalWeight) * 10) * 10) / 10;
}

// Bands are matched by `min` only (WCI_BANDS is sorted highest-to-lowest) so
// fractional scores between two whole-number boundaries — e.g. 69.2, between
// Fair's max of 69 and Good's min of 70 — still land in the correct band
// instead of falling through to the worst one. `max` is display-only.
export function getConditionBand(score: number, bands: ConditionBand[] = WCI_BANDS): ConditionBand {
  const ordered = [...bands].sort((a, b) => b.min - a.min);
  return ordered.find((b) => score >= b.min) ?? ordered[ordered.length - 1] ?? WCI_BANDS[WCI_BANDS.length - 1];
}
