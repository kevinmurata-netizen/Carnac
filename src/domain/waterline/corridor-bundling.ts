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
  /** How many years ahead work not yet due may be brought forward to join a
   * neighbour's bundle. 0 bundles only work due this year. */
  windowYears: number;
};

/** What joining a bundle did for one piece of work. */
export type CorridorJoin = {
  /** The funded asset it joined. */
  withAssetId: string;
  /** What it saved, in dollars. */
  saving: number;
  /** The year the work would have been due, where it was brought forward
   * from a later year to join. */
  dueYear?: number;
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
/**
 * The year an asset's work would first be due, looking up to `years` ahead —
 * or null when it is not due within them. `eligible` is the strategy's own
 * test, so "due" means what it means for the rest of the run.
 */
export function dueWithin<A extends { condition: number }>(
  asset: A,
  years: number,
  conditionIn: (asset: A, yearsAhead: number) => number,
  eligible: (asset: A) => boolean
): number | null {
  for (let k = 1; k <= years; k++) {
    if (eligible({ ...asset, condition: conditionIn(asset, k) })) return k;
  }
  return null;
}

export function corridorRepricer<T extends Bundleable>(
  candidates: T[],
  corridor: CorridorRun,
  rebate: (candidate: T, saving: number) => T,
  canJoin: (candidate: T, anchor: T) => boolean = () => true,
  /** For work brought forward: the year each such asset would have been due. */
  dueYear?: ReadonlyMap<string, number>
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
        const due = dueYear?.get(other);
        if (due != null) best = { ...best, dueYear: due };
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

/** Work held back to join a neighbour's bundle in a later year. */
export type Deferral = {
  /** The year it was held back in. */
  from: number;
  /** The year it waits for: when the neighbour's work comes due. */
  until: number;
  /** The neighbour it waits for. */
  withAssetId: string;
  /** What bundling is expected to save, estimated now. */
  saving: number;
  /** What waiting is expected to cost in failures over those years. */
  waitingCost: number;
};

/**
 * Which of this year's work to hold back for a neighbour's later bundle.
 *
 * An asset waits only when a neighbour not yet due will be within the window,
 * the pair has a saving set, that neighbour could not be brought forward to
 * join it this year instead, and the saving is larger than the failures the
 * asset is expected to cost by waiting. `skip` rules out the rest — work
 * already deferred once, work too risky to wait, work already committed.
 *
 * The saving is estimated as if the neighbour's work were like this asset's
 * own; the real figure is set when the two are bought together.
 */
export function chooseDeferrals<T extends Bundleable>(
  candidates: T[],
  year: number,
  corridor: CorridorRun,
  dueYear: ReadonlyMap<string, number>,
  /** Neighbours that could be brought forward this year, so need not be waited for. */
  bringable: ReadonlySet<string>,
  skip: (candidate: T) => boolean,
  waitingCost: (candidate: T, years: number) => number,
  /** Any asset's type, the neighbour's included — it is not a candidate yet. */
  typeOf: (assetId: string) => string | null | undefined,
  /** The run's last year: work never waits past it, since it could not be
   * bought after. */
  lastYear: number
): Map<string, Deferral> {
  const deferrals = new Map<string, Deferral>();
  const seen = new Set<string>();
  // Candidates arrive sorted by Priority Score, so the first per asset is the
  // work it would most likely get.
  for (const c of candidates) {
    if (seen.has(c.assetId)) continue;
    seen.add(c.assetId);
    if (skip(c)) continue;
    let best: Deferral | null = null;
    for (const n of corridor.neighbours.get(c.assetId) ?? []) {
      const until = dueYear.get(n);
      if (until == null || until <= year || until > year + corridor.windowYears || until > lastYear || bringable.has(n)) continue;
      const saving = joinSaving(pairSaving(corridor.savings, c.asset.assetTypeId ?? "", typeOf(n) ?? ""), c, c);
      if (saving <= 0) continue;
      const cost = waitingCost(c, until - year);
      if (saving > cost && (!best || saving - cost > best.saving - best.waitingCost)) {
        best = { from: year, until, withAssetId: n, saving, waitingCost: cost };
      }
    }
    if (best) deferrals.set(c.assetId, best);
  }
  return deferrals;
}
