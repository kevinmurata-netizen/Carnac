import { categoryLimits, type FundingPlan } from "./category-funding";
import type { TreatmentCategory, TreatmentOption } from "./treatment";

/**
 * Choosing one year's work: incremental benefit/cost across categories.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.7.
 *
 * Every applicable treatment and combination on every asset arrives scored.
 * The year's money is spent to buy the most weighted benefit it can, under
 * three rules:
 *
 *  1. **One treatment per asset per year.** The options on a segment are
 *     alternatives to each other, not a shopping list.
 *
 *  2. **Each step up is judged on what it adds.** A segment's options are
 *     laid out cheapest first, and every option is scored on the benefit it
 *     adds over the next cheaper one, divided by the extra it costs — doing
 *     nothing being the rung below the cheapest. Across the whole network the
 *     best next step is bought first, whether that is a first fix somewhere
 *     or a move from a patch to a relining somewhere else.
 *
 *     This replaced ranking each option on its own benefit ÷ cost. That
 *     almost always bought the cheapest option on every segment — the average
 *     benefit per dollar of a larger job includes the cheap first gains, and
 *     still loses — so a relining that was well worth its extra cost over a
 *     patch never got the chance. Measured on the seed network before the
 *     change: the same budget ended 2.3 WCI points higher with 29 fewer
 *     segments below target. It also retired two rules that existed to prop
 *     the old score up: combinations no longer need a preference (a bundle is
 *     simply a rung, bought when its step is worth it) and work that pays for
 *     itself no longer needs its own tier.
 *
 *  3. **A category's share of the year is a limit, not a turn.** Moving a
 *     segment up can move it into another category, and then its whole cost
 *     counts against that category. No category may exceed its share; the
 *     order categories are listed in a plan plays no part.
 *
 * Options that cost more for no more benefit, or whose step up is a worse deal
 * than skipping straight past them, are never on the ladder at all.
 */

/** What the caller must be able to tell us about a scored option. */
export type Rankable = {
  assetId: string;
  option: TreatmentOption;
  cost: number;
  /** Priority Score. Null means it could not be priced; such an option is
   * never selected. */
  priority: number | null;
  /** The Priority Score's numerator, unrounded: criticality × scale factor ×
   * category weight × expected benefit. What a step up adds is measured in it. */
  value: number;
};

/**
 * Why an option the year could have bought was not bought, in a few words.
 *
 * Kept as a closed set rather than free text: these are the only things that
 * stop a scored option, they are what the alternatives page filters on, and a
 * sentence assembled per row would drift from the rule that produced it.
 */
export const NOT_SELECTED = {
  betterOption: "Larger option funded on this segment",
  notEfficient: "Another option gives more for the money",
  budgetSpent: "Year's budget spent",
  categoryFull: "Category budget full",
  unpriced: "Could not be priced",
  categoryUnfunded: "Category not in the funding plan",
  /** Only with delivery lead times: the money would fall in a year past the
   * end of the run, which has no budget to check it against. */
  beyondHorizon: "Would be paid for after the run ends",
} as const;

export const SELECTED = "Selected";

/** A rung's incremental score, and the option it was measured against — null
 * for the cheapest rung, which is measured against doing nothing. */
export type IncrementalScore<T> = { score: number; over: T | null };

export type SelectionResult<T extends Rankable> = {
  /** In the order each segment was first funded. */
  selected: T[];
  /** What each segment ends up with, including a segment that stepped up from
   * work it already held — which `selected` leaves out, since that segment was
   * not funded here for the first time. */
  chosen: Map<string, T>;
  /** Every candidate, against what happened to it: `SELECTED`, or one of
   * `NOT_SELECTED`. */
  outcome: Map<T, string>;
  /** Each option on a segment's ladder, with its incremental score. Options
   * off the ladder, or never priced, are absent. */
  incremental: Map<T, IncrementalScore<T>>;
  /** What each category took, and what it was allowed to take. */
  byCategory: Array<{ category: TreatmentCategory | "All"; spent: number; cap: number }>;
  totalSpent: number;
  /**
   * Cost of work passed over because its category was full while the year's
   * budget was not. The distinction matters: "we ran out of money" and "we ran
   * out of money *for that kind of work*" call for different answers.
   */
  cappedOut: number;
};

/** Incremental scores are shown beside Priority Scores, in the same units and
 * to the same precision. */
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * One segment's options that could ever be worth buying, cheapest first.
 *
 * Drops anything costing more for no more value, then anything whose step up
 * is a better deal than the step before it — its lower rung would never be
 * bought on its own merits, so the ladder skips it. What remains has falling
 * incremental scores, which is what makes buying the best next step anywhere
 * on the network the right order.
 */
export function efficientLadder<T extends Rankable>(options: T[]): T[] {
  const sorted = [...options].sort((a, b) => a.cost - b.cost || b.value - a.value);
  const ladder: T[] = [];
  for (const option of sorted) {
    if (ladder.length > 0 && option.value <= ladder[ladder.length - 1].value) continue;
    while (ladder.length > 0) {
      const last = ladder[ladder.length - 1];
      const below = ladder.length > 1 ? ladder[ladder.length - 2] : null;
      const lastStep = (last.value - (below?.value ?? 0)) / (last.cost - (below?.cost ?? 0));
      const nextStep = (option.value - last.value) / (option.cost - last.cost);
      if (nextStep >= lastStep) ladder.pop();
      else break;
    }
    ladder.push(option);
  }
  return ladder;
}

/** A max-heap of each segment's next step, so the best step on the network is
 * found without rescanning every segment each time one is bought. */
class StepHeap {
  private items: Array<{ assetId: string; rung: number; score: number; seq: number }> = [];
  private seq = 0;

  get size() {
    return this.items.length;
  }

  push(assetId: string, rung: number, score: number) {
    this.items.push({ assetId, rung, score, seq: this.seq++ });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
      i = parent;
    }
  }

  pop() {
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < this.items.length && this.before(l, best)) best = l;
        if (r < this.items.length && this.before(r, best)) best = r;
        if (best === i) break;
        [this.items[i], this.items[best]] = [this.items[best], this.items[i]];
        i = best;
      }
    }
    return top;
  }

  /** Higher score first; on a tie, whichever was offered first — candidates
   * arrive sorted by Priority Score, so that is the higher-priority segment. */
  private before(a: number, b: number) {
    const x = this.items[a];
    const y = this.items[b];
    return x.score > y.score || (x.score === y.score && x.seq < y.seq);
  }
}

/**
 * Where the money comes from, and what it may be spent on.
 *
 * Separated from the algorithm above because the two engines differ only in
 * this. A scenario with no lead times spends one year's budget: a purse of a
 * single number. A scenario that programs work years before it is built spends
 * against a ledger of many years at once, and stepping a segment up refunds
 * what its earlier choice had reserved. Everything else — the ladders, the
 * heap, what counts as the best next step — must stay identical, or the two
 * could not be compared.
 */
export type Purse<T extends Rankable> = {
  /** Null when it can be afforded; otherwise a NOT_SELECTED reason. `current`
   * is what the segment already holds and would be refunded. */
  check(next: T, current: T | null): string | null;
  /** Take the money, giving back whatever `current` had reserved. */
  commit(next: T, current: T | null): void;
  /** Refused outright, before any ladder is built — a category with nothing to
   * spend at all. Null when it is spendable. */
  unfunded(candidate: T): string | null;
  byCategory(): SelectionResult<T>["byCategory"];
  totalSpent(): number;
};

/** One year's money, spent on one year's work: how every scenario ran before
 * delivery lead times existed. */
export function yearPurse<T extends Rankable>(budget: number, plan: FundingPlan): Purse<T> {
  const limits = categoryLimits(plan, budget);
  const limitOf = (category: TreatmentCategory) => (limits == null ? budget : (limits.get(category) ?? 0));
  const spentBy = new Map<TreatmentCategory, number>();
  let spent = 0;

  const after = (next: T, current: T | null) => {
    const category = next.option.category;
    return {
      category,
      total: spent - (current?.cost ?? 0) + next.cost,
      inCategory:
        (spentBy.get(category) ?? 0) -
        (current && current.option.category === category ? current.cost : 0) +
        next.cost,
    };
  };

  return {
    unfunded: (candidate) => (limitOf(candidate.option.category) <= 0 ? NOT_SELECTED.categoryUnfunded : null),
    check(next, current) {
      const { category, total, inCategory } = after(next, current);
      if (total > budget) return NOT_SELECTED.budgetSpent;
      if (inCategory > limitOf(category)) return NOT_SELECTED.categoryFull;
      return null;
    },
    commit(next, current) {
      const { category, total, inCategory } = after(next, current);
      // The refund first, in case the two are in different categories.
      if (current) spentBy.set(current.option.category, (spentBy.get(current.option.category) ?? 0) - current.cost);
      spentBy.set(category, current?.option.category === category ? inCategory : (spentBy.get(category) ?? 0) + next.cost);
      spent = total;
    },
    byCategory: () =>
      limits == null
        ? [{ category: "All" as const, spent, cap: budget }]
        : [...limits].map(([category, cap]) => ({ category, spent: spentBy.get(category) ?? 0, cap })),
    totalSpent: () => spent,
  };
}

export function selectForYear<T extends Rankable>(
  candidates: T[],
  budget: number,
  plan: FundingPlan
): SelectionResult<T> {
  return selectAgainst(candidates, yearPurse<T>(budget, plan));
}

/**
 * The selection itself: ladders, then the best next step anywhere, until the
 * purse says no. What the purse is — one year's budget or a ledger of years —
 * is deliberately none of this function's business.
 *
 * `held` is work a segment already has reserved but has not yet received: it
 * sits at the bottom of that segment's ladder, so stepping up means replacing
 * it and getting its money back.
 */
export function selectAgainst<T extends Rankable>(
  candidates: T[],
  purse: Purse<T>,
  held?: Map<string, T>
): SelectionResult<T> {
  const outcome = new Map<T, string>();
  const incremental = new Map<T, IncrementalScore<T>>();

  // Segments' ladders, in the order segments first appear (Priority Score
  // order), which the heap uses to break ties.
  const bySegment = new Map<string, T[]>();
  for (const c of candidates) {
    const unfunded = purse.unfunded(c);
    if (c.priority == null || !(c.cost > 0) || !Number.isFinite(c.value)) {
      outcome.set(c, NOT_SELECTED.unpriced);
    } else if (unfunded) {
      outcome.set(c, unfunded);
    } else {
      bySegment.set(c.assetId, [...(bySegment.get(c.assetId) ?? []), c]);
    }
  }

  const ladders = new Map<string, T[]>();
  for (const [assetId, options] of bySegment) {
    let ladder = efficientLadder(options);
    // Work the segment already holds stands at the bottom of its ladder even
    // when the hull would have dropped it: it is already paid for, so what
    // matters is what each larger option adds over *it*, and buying one gives
    // its money back.
    const owned = held?.get(assetId);
    if (owned && !ladder.includes(owned)) {
      ladder = [owned, ...ladder.filter((o) => o.cost > owned.cost && o.value > owned.value)];
    }
    ladders.set(assetId, ladder);
    ladder.forEach((rung, i) => {
      const below = i > 0 ? ladder[i - 1] : null;
      incremental.set(rung, {
        score: round4((rung.value - (below?.value ?? 0)) / (rung.cost - (below?.cost ?? 0))),
        over: below,
      });
    });
    for (const option of options) if (!ladder.includes(option)) outcome.set(option, NOT_SELECTED.notEfficient);
  }

  const heap = new StepHeap();
  const stepScore = (assetId: string, rung: number) => {
    const ladder = ladders.get(assetId)!;
    const below = rung > 0 ? ladder[rung - 1] : null;
    return (ladder[rung].value - (below?.value ?? 0)) / (ladder[rung].cost - (below?.cost ?? 0));
  };
  const level = new Map<string, number>();
  const firstFunded: string[] = [];
  // A segment that already holds work starts where that work sits, and climbs
  // from there; its money is already out, so it is not "first funded" here.
  for (const [assetId, ladder] of ladders) {
    const owned = held?.get(assetId);
    const start = owned ? ladder.indexOf(owned) : -1;
    if (start >= 0) level.set(assetId, start);
    const next = start + 1;
    if (next < ladder.length) heap.push(assetId, next, stepScore(assetId, next));
  }

  /** Why a segment stopped climbing, for every rung above where it stopped. */
  const stoppedBy = new Map<string, string>();

  while (heap.size > 0) {
    const { assetId, rung } = heap.pop();
    const ladder = ladders.get(assetId)!;
    const next = ladder[rung];
    const current = rung > 0 ? ladder[rung - 1] : null;

    const refused = purse.check(next, current);
    if (refused) {
      stoppedBy.set(assetId, refused);
      continue;
    }

    purse.commit(next, current);
    if (!current) firstFunded.push(assetId);
    level.set(assetId, rung);
    if (rung + 1 < ladder.length) heap.push(assetId, rung + 1, stepScore(assetId, rung + 1));
  }

  const selected: T[] = [];
  let cappedOut = 0;
  for (const [assetId, ladder] of ladders) {
    const chosen = level.get(assetId) ?? -1;
    ladder.forEach((rung, i) => {
      if (i < chosen) outcome.set(rung, NOT_SELECTED.betterOption);
      else if (i === chosen) outcome.set(rung, SELECTED);
      else outcome.set(rung, stoppedBy.get(assetId) ?? NOT_SELECTED.budgetSpent);
    });
    // Nothing at all on this segment, because its first step's category was
    // full while the year still had money.
    if (chosen < 0 && stoppedBy.get(assetId) === NOT_SELECTED.categoryFull) cappedOut += ladder[0].cost;
  }
  for (const assetId of firstFunded) selected.push(ladders.get(assetId)![level.get(assetId)!]);

  const chosen = new Map<string, T>();
  for (const [assetId, ladder] of ladders) {
    const at = level.get(assetId);
    if (at != null && at >= 0) chosen.set(assetId, ladder[at]);
  }

  return {
    selected,
    chosen,
    outcome,
    incremental,
    byCategory: purse.byCategory(),
    totalSpent: purse.totalSpent(),
    cappedOut,
  };
}
