// Scale Factor — how big a piece of work an asset represents.
//
// It multiplies the Priority Score, which is what makes it different from
// criticality despite sharing a language: criticality is a 0-100 rating and is
// clamped, while a scale factor is a magnitude and clamping it would destroy
// the answer. A segment 1,959 ft long has a scale factor of 1,959 when the
// formula is LENGTH, and squeezing that into 0-100 would make every long
// segment identical.
//
// See docs/TREATMENT-MODEL-REBUILD.md §5.2.

/**
 * What an asset scores when its formula cannot be evaluated — a missing
 * length, a field the formula reads that this asset has no value for.
 *
 * One, because one is the identity for multiplication: the asset ranks as
 * though scale simply does not apply to it, rather than ranking last. Zero
 * would delete it from consideration, which is a much stronger statement than
 * "we do not know how big this is".
 *
 * It is still a compromise, and the honest one to be aware of: where the
 * formula is LENGTH and typical values are in the thousands, an asset that
 * falls back to 1 ranks far below its neighbours. The formula author has the
 * tools to say otherwise — `max(LENGTH, 500)` floors it at a defensible
 * figure — and the preview reports how many assets are missing inputs, so the
 * problem is visible while the formula is being written rather than after.
 */
export const NEUTRAL_SCALE_FACTOR = 1;

/**
 * A raw formula result as a usable multiplier.
 *
 * Negative and zero are refused rather than passed through: a negative scale
 * factor would inverts the ranking, and a zero would silently remove the asset
 * from every plan. Both are far more likely to be a formula mistake than an
 * intention, and neither has a defensible reading.
 */
export function toScaleFactor(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return NEUTRAL_SCALE_FACTOR;
  return Math.round(raw * 100) / 100;
}
