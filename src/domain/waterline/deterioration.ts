// Deterioration modeling: two transparent model families per the spec's
// minimum requirement — (1) curve-based and (2) Markov state-transition.
// Both are pure functions over stored parameters; no fitted/opaque models yet
// (calibration against observed inspections is a later concern the schema
// already accommodates via DeteriorationPrediction.observedCondition).

import { WCI_BANDS } from "./condition";

// ---------------------------------------------------------------------------
// Curve-based family
//
//   WCI(age) = initial - (initial - min) * (age / serviceLife) ^ shape
//
// shape > 1 gives the classic infrastructure curve: slow early loss, then
// accelerating decline. One curve per material; applicability is stored on
// the DeteriorationModel row so admins can retarget without code changes.
// ---------------------------------------------------------------------------

export type CurveParams = {
  initialCondition: number;
  minCondition: number;
  /** Years from new to minCondition */
  serviceLife: number;
  /** Curvature exponent; >1 = slow-then-fast decline */
  shape: number;
};

export const MATERIAL_CURVES: Record<string, CurveParams> = {
  PVC: { initialCondition: 100, minCondition: 0, serviceLife: 80, shape: 1.6 },
  HDPE: { initialCondition: 100, minCondition: 0, serviceLife: 80, shape: 1.6 },
  "Ductile Iron": { initialCondition: 100, minCondition: 0, serviceLife: 95, shape: 1.4 },
  Copper: { initialCondition: 100, minCondition: 0, serviceLife: 75, shape: 1.4 },
  Steel: { initialCondition: 100, minCondition: 0, serviceLife: 70, shape: 1.3 },
  "Cast Iron": { initialCondition: 100, minCondition: 0, serviceLife: 65, shape: 1.2 },
  "Asbestos Cement": { initialCondition: 100, minCondition: 0, serviceLife: 55, shape: 1.1 },
};

export const DEFAULT_CURVE: CurveParams = { initialCondition: 100, minCondition: 0, serviceLife: 75, shape: 1.4 };

export function evaluateCurve(params: CurveParams, ageYears: number): number {
  if (ageYears <= 0) return params.initialCondition;
  const ratio = Math.min(ageYears / params.serviceLife, 1);
  const wci = params.initialCondition - (params.initialCondition - params.minCondition) * Math.pow(ratio, params.shape);
  return Math.round(wci * 10) / 10;
}

/** Invert the curve: the age at which it predicts `condition`. Used to anchor
 * an asset's forecast to its *observed* condition rather than its calendar
 * age — a pipe measuring WCI 40 is treated as being at the curve age where
 * the curve equals 40, wherever its install date says it "should" be. */
export function effectiveAgeForCondition(params: CurveParams, condition: number): number {
  const clamped = Math.min(Math.max(condition, params.minCondition), params.initialCondition);
  const span = params.initialCondition - params.minCondition;
  if (span <= 0) return 0;
  const ratio = Math.pow((params.initialCondition - clamped) / span, 1 / params.shape);
  return ratio * params.serviceLife;
}

export type ForecastPoint = { year: number; predictedCondition: number };

/** Forecast `horizonYears` of annual conditions starting from an anchor:
 * observed condition if available, else calendar age on the raw curve. */
export function forecastFromCurve(
  params: CurveParams,
  anchor: { condition: number } | { ageYears: number },
  startYear: number,
  horizonYears: number
): ForecastPoint[] {
  const baseAge = "condition" in anchor ? effectiveAgeForCondition(params, anchor.condition) : anchor.ageYears;
  const points: ForecastPoint[] = [];
  for (let i = 0; i <= horizonYears; i++) {
    points.push({ year: startYear + i, predictedCondition: evaluateCurve(params, baseAge + i) });
  }
  return points;
}

/** Years until the curve, anchored at `currentCondition`, crosses `threshold`
 * (default 25 = Poor/Very Poor boundary). Null if already below. */
export function remainingLifeYears(params: CurveParams, currentCondition: number, threshold = 25): number | null {
  if (currentCondition <= threshold) return 0;
  const now = effectiveAgeForCondition(params, currentCondition);
  const atThreshold = effectiveAgeForCondition(params, threshold);
  return Math.max(0, Math.round(atThreshold - now));
}

// ---------------------------------------------------------------------------
// Markov state-transition family
//
// Five states = the five WCI bands. The annual matrix gives P(state -> state);
// deterioration only moves down (no repair in the "do nothing" scenario).
// Expected WCI = Σ state-probability × band midpoint.
// ---------------------------------------------------------------------------

export const MARKOV_STATES = WCI_BANDS.map((b) => b.label); // Excellent..Very Poor
const STATE_MIDPOINTS = WCI_BANDS.map((b) => (b.min + b.max) / 2);

/** Row i = from-state, column j = to-state (state order matches WCI_BANDS:
 * Excellent, Good, Fair, Poor, Very Poor). Rows sum to 1. */
export const DEFAULT_TRANSITION_MATRIX: number[][] = [
  [0.88, 0.12, 0.0, 0.0, 0.0],
  [0.0, 0.87, 0.13, 0.0, 0.0],
  [0.0, 0.0, 0.86, 0.14, 0.0],
  [0.0, 0.0, 0.0, 0.85, 0.15],
  [0.0, 0.0, 0.0, 0.0, 1.0],
];

export function conditionToStateVector(condition: number): number[] {
  const index = WCI_BANDS.findIndex((b) => condition >= b.min);
  const vector = Array(WCI_BANDS.length).fill(0);
  vector[index === -1 ? WCI_BANDS.length - 1 : index] = 1;
  return vector;
}

export function stepStateVector(vector: number[], matrix: number[][]): number[] {
  const next = Array(vector.length).fill(0);
  for (let from = 0; from < vector.length; from++) {
    if (vector[from] === 0) continue;
    for (let to = 0; to < vector.length; to++) {
      next[to] += vector[from] * matrix[from][to];
    }
  }
  return next;
}

export function expectedCondition(vector: number[]): number {
  const value = vector.reduce((sum, p, i) => sum + p * STATE_MIDPOINTS[i], 0);
  return Math.round(value * 10) / 10;
}

export function forecastFromMarkov(
  matrix: number[][],
  startVector: number[],
  startYear: number,
  horizonYears: number
): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  let vector = startVector;
  for (let i = 0; i <= horizonYears; i++) {
    points.push({ year: startYear + i, predictedCondition: expectedCondition(vector) });
    vector = stepStateVector(vector, matrix);
  }
  return points;
}

export const FORECAST_HORIZON_YEARS = 10;
export const NETWORK_CONDITION_TARGET = 70;
