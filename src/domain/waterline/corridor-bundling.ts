import { pairSaving, type PairSaving } from "./corridor";
import type { Rankable } from "./selection";
import type { TreatmentOption } from "./treatment";

/**
 * Corridor bundling within a year: work on neighbouring assets done together,
 * for what that saves.
 *
 * As the year's work is bought, best step first, each asset that gets work
 * makes its unfunded neighbours cheaper: their options come back at their
 * bundled price — the pair's saving taken off — and compete for the rest of
 * the year's money on that price. What joins becomes funded work in turn, so
 * a bundle can run along a street. Work funded first pays full price; work
 * that joins pays less.
 */

/** What a run needs to bundle: who neighbours whom, and what pairs save. */
export type CorridorRun = {
  neighbours: Map<string, Set<string>>;
  savings: Map<string, PairSaving>;
};

/** What joining a bundle did for one piece of work. */
export type CorridorJoin = {
  /** The funded asset it joined. */
  withAssetId: string;
  /** What it saved, in dollars. */
  saving: number;
};

type Bundleable = Rankable & {
  asset: { id: string; assetTypeId?: string | null };
  option: TreatmentOption;
};

/**
 * What doing `joining` beside `anchor` saves. One mobilization is charged at
 * the larger of the two, so sharing it saves the smaller; the pair's further
 * share comes off what is left of the joining work's price.
 */
export function joinSaving(saving: PairSaving | null, joining: Bundleable, anchor: Bundleable): number {
  if (!saving) return 0;
  const mobilization = saving.sharesMobilization
    ? Math.min(joining.option.mobilization ?? 0, anchor.option.mobilization ?? 0)
    : 0;
  const rest = Math.max(0, joining.cost - mobilization);
  return Math.max(0, Math.min(joining.cost, mobilization + saving.savingPct * rest));
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** The Priority Score at a new price: its numerator over the new cost, as
 * `priorityScore` computes it. */
export const repriced = (value: number, cost: number) => (cost > 0 && Number.isFinite(value / cost) ? round4(value / cost) : null);

/**
 * Re-pricing for one year's selection: when a segment is first funded, each
 * unfunded neighbour's options come back at their bundled price — the best
 * saving against any funded neighbour — and compete for what is left.
 *
 * `rebate` makes the bundled copy of a candidate — the engine's to do, since
 * only it knows what else a price touches (the lead-time engine's
 * instalments). `canJoin` says whether two pieces of work could be done
 * together at all; the lead-time engine requires the same build year.
 *
 * Pass `onFunded` to `selectAgainst`. Afterwards `offeredAs` maps each
 * original candidate to the bundled copy it was last offered as, and
 * `joinOf` says how a funded copy joined.
 */
export function corridorRepricer<T extends Bundleable>(
  candidates: T[],
  corridor: CorridorRun,
  rebate: (candidate: T, saving: number) => T,
  canJoin: (candidate: T, anchor: T) => boolean = () => true
) {
  const bySegment = new Map<string, T[]>();
  for (const c of candidates) bySegment.set(c.assetId, [...(bySegment.get(c.assetId) ?? []), c]);
  const funded = new Map<string, T>();
  const offeredAs = new Map<T, T>();
  const joinOf = new Map<T, CorridorJoin>();

  const onFunded = (assetId: string, work: T): Map<string, T[]> | null => {
    funded.set(assetId, work);
    const near = corridor.neighbours.get(assetId);
    if (!near) return null;
    const changes = new Map<string, T[]>();
    for (const other of near) {
      if (funded.has(other)) continue;
      const options = bySegment.get(other);
      if (!options) continue;
      let changed = false;
      const priced = options.map((c) => {
        // The best saving against every funded neighbour, not only this one.
        let best: CorridorJoin | null = null;
        for (const n of corridor.neighbours.get(other) ?? []) {
          const anchor = funded.get(n);
          if (!anchor || !canJoin(c, anchor)) continue;
          const saved = joinSaving(
            pairSaving(corridor.savings, c.asset.assetTypeId ?? "", anchor.asset.assetTypeId ?? ""),
            c,
            anchor
          );
          if (saved > 0 && (!best || saved > best.saving)) best = { withAssetId: n, saving: saved };
        }
        if (!best) return c;
        changed = true;
        const copy = rebate(c, best.saving);
        joinOf.set(copy, best);
        offeredAs.set(c, copy);
        return copy;
      });
      if (changed) changes.set(other, priced);
    }
    return changes.size > 0 ? changes : null;
  };

  return { onFunded, offeredAs, joinOf };
}
