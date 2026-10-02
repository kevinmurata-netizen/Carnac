/**
 * How components wear out, and what that does to the asset they make up.
 *
 * The same curve family as the waterline material curves —
 *   condition(age) = initial − (initial − min) × (age / serviceLife) ^ shape
 * — with one curve per component on each kind of asset, because a coating and
 * a shell on the same reservoir age on entirely different clocks. A
 * component's forecast starts from where its last inspection found it, aged by
 * the years since, so a coating rated in 2019 is forecast from 2019's
 * condition carried forward rather than as if it were measured today.
 */

import { effectiveAgeForCondition, evaluateCurve, type CurveParams } from "@/domain/waterline/deterioration";

/**
 * Typical years from new to failure, by component type code. Starting points
 * for the curves an organization then adjusts under Settings › Deterioration
 * Models; a component type added since gets the fallback.
 */
export const COMPONENT_SERVICE_LIVES: Record<string, number> = {
  TANK_SHELL: 80,
  ROOF: 45,
  FLOOR: 70,
  COATING_SYSTEM: 20,
  CATHODIC_PROTECTION: 20,
  WELL_CASING: 60,
  WELL_SCREEN: 40,
  PUMP: 20,
  MOTOR: 25,
  PIPING: 50,
  CONTROLS: 15,
};

export const FALLBACK_COMPONENT_LIFE = 40;

/** Slow early loss then accelerating decline — the shape the sample
 * condition history was generated on, and typical of mechanical parts and
 * coatings alike. */
export const COMPONENT_CURVE_SHAPE = 1.6;

/** Below this a component is due for intervention: the Poor / Very Poor line
 * the waterline forecasts use too. */
export const INTERVENTION_THRESHOLD = 25;

export function defaultComponentCurve(componentTypeCode: string): CurveParams {
  return {
    initialCondition: 100,
    minCondition: 0,
    serviceLife: COMPONENT_SERVICE_LIVES[componentTypeCode] ?? FALLBACK_COMPONENT_LIFE,
    shape: COMPONENT_CURVE_SHAPE,
  };
}

/** Where a component's forecast starts: what it was found to be, and when;
 * or, never inspected, how old it is. */
export type ComponentAnchor = { condition: number; asOfYear: number } | { ageYears: number };

/** The curve age a component is at in `year`. */
function ageIn(curve: CurveParams, anchor: ComponentAnchor, year: number): number {
  if ("condition" in anchor) {
    return effectiveAgeForCondition(curve, anchor.condition) + Math.max(0, year - anchor.asOfYear);
  }
  return anchor.ageYears;
}

export type ComponentForecast = {
  points: Array<{ year: number; condition: number }>;
  /** Years from `startYear` until the curve crosses the intervention
   * threshold; 0 if already below it; null if it never does in the curve's life. */
  remainingLife: number | null;
};

export function forecastComponent(
  curve: CurveParams,
  anchor: ComponentAnchor,
  startYear: number,
  horizonYears: number
): ComponentForecast {
  const age0 = ageIn(curve, anchor, startYear);
  const points = Array.from({ length: horizonYears + 1 }, (_, i) => ({
    year: startYear + i,
    condition: evaluateCurve(curve, age0 + i),
  }));

  const now = evaluateCurve(curve, age0);
  let remainingLife: number | null;
  if (now <= INTERVENTION_THRESHOLD) remainingLife = 0;
  else if (curve.minCondition >= INTERVENTION_THRESHOLD) remainingLife = null;
  else remainingLife = Math.max(0, Math.round(effectiveAgeForCondition(curve, INTERVENTION_THRESHOLD) - age0));

  return { points, remainingLife };
}
