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
} as const;

export const SELECTED = "Selected";

/** A rung's incremental score, and the option it was measured against — null
 * for the cheapest rung, which is measured against doing nothing. */
export type IncrementalScore<T> = { score: number; over: T | null };

export type SelectionResult<T extends Rankable> = {
  /** In the order each segment was first funded. */
  selected: T[];
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

export function selectForYear<T extends Rankable>(
  candidates: T[],
  budget: number,
  plan: FundingPlan
): SelectionResult<T> {
  const limits = categoryLimits(plan, budget);
  const limitOf = (category: TreatmentCategory) => (limits == null ? budget : (limits.get(category) ?? 0));

  const outcome = new Map<T, string>();
  const incremental = new Map<T, IncrementalScore<T>>();

  // Segments' ladders, in the order segments first appear (Priority Score
  // order), which the heap uses to break ties.
  const bySegment = new Map<string, T[]>();
  for (const c of candidates) {
    if (c.priority == null || !(c.cost > 0) || !Number.isFinite(c.value)) {
      outcome.set(c, NOT_SELECTED.unpriced);
    } else if (limitOf(c.option.category) <= 0) {
      outcome.set(c, NOT_SELECTED.categoryUnfunded);
    } else {
      bySegment.set(c.assetId, [...(bySegment.get(c.assetId) ?? []), c]);
    }
  }

  const ladders = new Map<string, T[]>();
  for (const [assetId, options] of bySegment) {
    const ladder = efficientLadder(options);
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
  for (const assetId of ladders.keys()) heap.push(assetId, 0, stepScore(assetId, 0));

  const level = new Map<string, number>();
  const firstFunded: string[] = [];
  /** Why a segment stopped climbing, for every rung above where it stopped. */
  const stoppedBy = new Map<string, string>();
  const spentBy = new Map<TreatmentCategory, number>();
  let totalSpent = 0;

  while (heap.size > 0) {
    const { assetId, rung } = heap.pop();
    const ladder = ladders.get(assetId)!;
    const next = ladder[rung];
    const current = rung > 0 ? ladder[rung - 1] : null;
    const category = next.option.category;

    const totalAfter = totalSpent - (current?.cost ?? 0) + next.cost;
    const categoryAfter =
      (spentBy.get(category) ?? 0) - (current && current.option.category === category ? current.cost : 0) + next.cost;

    if (totalAfter > budget) {
      stoppedBy.set(assetId, NOT_SELECTED.budgetSpent);
      continue;
    }
    if (categoryAfter > limitOf(category)) {
      stoppedBy.set(assetId, NOT_SELECTED.categoryFull);
      continue;
    }

    if (current) spentBy.set(current.option.category, (spentBy.get(current.option.category) ?? 0) - current.cost);
    else firstFunded.push(assetId);
    spentBy.set(category, (spentBy.get(category) ?? 0) + next.cost);
    totalSpent = totalAfter;
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

  const byCategory: SelectionResult<T>["byCategory"] =
    limits == null
      ? [{ category: "All", spent: totalSpent, cap: budget }]
      : [...limits].map(([category, cap]) => ({ category, spent: spentBy.get(category) ?? 0, cap }));

  return { selected, outcome, incremental, byCategory, totalSpent, cappedOut };
}
