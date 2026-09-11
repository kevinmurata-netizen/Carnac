import type { TreatmentOption } from "./treatment";

/**
 * How soon a treatment may be repeated on the same asset.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.8.
 *
 * This is a backstop, and it matters that it is understood as one. In a
 * well-built library the rules already prevent re-treatment — relining resets
 * condition to 85 and the relining rule only fires between 20 and 55, so a
 * segment cannot re-qualify until it has decayed back down. The treatment's
 * own effect is what stops it being bought again, which is how the real thing
 * works and what an organization should be investing in.
 *
 * The interval exists because assuming every library is built that carefully
 * is unrealistic, and a model whose rules are looser than its author intended
 * will buy the same work every year without anything reporting that it was
 * not meant. Five years catches that. Anything longer is a statement about a
 * particular treatment, and is worth someone typing.
 */

/** What a treatment with no interval of its own gets. Short on purpose: it is
 * here to catch a pathology, not to express policy. */
export const DEFAULT_RETREATMENT_INTERVAL_YEARS = 5;

export function intervalFor(treatment: { retreatmentIntervalYears?: number | null }): number {
  const raw = treatment.retreatmentIntervalYears;
  if (raw == null || !Number.isFinite(raw) || raw < 0) return DEFAULT_RETREATMENT_INTERVAL_YEARS;
  return raw;
}

/**
 * When each treatment was last applied to each asset.
 *
 * Keyed by treatment *name* rather than id because that is what a built option
 * carries, and because the simulation works in domain objects that never hold
 * a database identifier.
 */
export type TreatmentHistory = Map<string, Map<string, number>>;

export function recordTreatment(history: TreatmentHistory, assetId: string, option: TreatmentOption, year: number) {
  const onAsset = history.get(assetId) ?? new Map<string, number>();
  // Every member, not the option's label. Applying "Restore and protect"
  // really does line and coat the pipe, and both have to be locked — otherwise
  // relining a segment and then buying a bundle containing relining two years
  // later gets the same work done twice under a different name.
  for (const member of option.members) onAsset.set(member.name, year);
  history.set(assetId, onAsset);
}

/**
 * Whether this option is still inside the lockout of anything it would apply.
 *
 * A combination is blocked when *any* member is blocked, which is the other
 * half of recording every member: the bundle is not a distinct treatment that
 * happens to include relining, it is relining plus something else.
 */
export function withinInterval(
  history: TreatmentHistory,
  assetId: string,
  option: TreatmentOption,
  year: number
): boolean {
  const onAsset = history.get(assetId);
  if (!onAsset) return false;

  return option.members.some((member) => {
    const last = onAsset.get(member.name);
    if (last == null) return false;
    return year - last < intervalFor(member);
  });
}

/** The longest lockout this option would impose, for a UI that wants to say
 * what applying it costs in flexibility. */
export function lockoutYears(option: TreatmentOption): number {
  return option.members.reduce((longest, m) => Math.max(longest, intervalFor(m)), 0);
}
