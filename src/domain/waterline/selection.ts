import { fundingPasses, type FundingPlan } from "./category-funding";
import type { TreatmentCategory, TreatmentOption } from "./treatment";

/**
 * Choosing one year's work from a ranked list.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.7.
 *
 * The list arrives already sorted by Priority Score, highest first, with every
 * applicable treatment and every applicable combination on every asset in it.
 * This decides which of them the year's money buys, under four rules:
 *
 *  1. **Categories spend in order.** The funding plan's first category takes
 *     what it can up to its share of the year, then the second, and so on.
 *     Order is a decision, not a detail: with a fixed budget, "repair before
 *     renewal" and "renewal before repair" buy different networks.
 *
 *  2. **One treatment per asset per year.** Once an asset is funded, it is out
 *     for the rest of the year — including for every later category. A segment
 *     does not get relined in March and replaced in September.
 *
 *  3. **Within a category, the best option on an asset wins** and the rest of
 *     that asset's options in that category are passed over. They are
 *     alternatives to each other, not a shopping list.
 *
 *  4. **A combination beats a single treatment on the same asset**, even when
 *     it scores lower, provided it fits what is left. Doing two things in one
 *     visit is worth something the Priority Score does not measure — the
 *     second excavation, the second shutdown, the second round of customer
 *     notices — and the model would otherwise buy the patch and come back.
 *     Rule 2 then keeps it from coming back anyway.
 */

/** What the caller must be able to tell us about a ranked option. */
export type Rankable = {
  assetId: string;
  option: TreatmentOption;
  cost: number;
  /** Priority Score. Null means it could not be priced; such an option is
   * never selected. */
  priority: number | null;
  /** Whether the work pays for itself over the horizon. Options that do are
   * bought before options that do not — including for the combination
   * preference below, which must not reach past a tier to find a bundle. */
  paysForItself: boolean;
};

/**
 * Why an option the year could have bought was not bought, in a few words.
 *
 * Kept as a closed set rather than free text: these are the only things that
 * stop a ranked option, they are what the alternatives page filters on, and a
 * sentence assembled per row would drift from the rule that produced it.
 */
export const NOT_SELECTED = {
  betterOption: "Better option on this segment",
  bundle: "Bundle chosen on this segment",
  alreadyTreated: "Segment already treated this year",
  budgetSpent: "Year's budget spent",
  categoryFull: "Category budget full",
  unpriced: "Could not be priced",
  categoryUnfunded: "Category not in the funding plan",
} as const;

export const SELECTED = "Selected";

export type SelectionResult<T extends Rankable> = {
  /** In the order they were selected, which is the order they were funded. */
  selected: T[];
  /**
   * Every candidate, against what happened to it: `SELECTED`, or one of
   * `NOT_SELECTED`. Built during the walk rather than worked out afterwards,
   * because "the budget was spent" is only true of the moment the option's
   * turn came — by the end of the year the figures no longer show it.
   */
  outcome: Map<T, string>;
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

/**
 * `candidates` must be sorted by priority, highest first. It is not sorted
 * here: the caller has already paid for the sort, and re-sorting would hide
 * the fact that the order is an input rather than an implementation detail.
 */
export function selectForYear<T extends Rankable>(
  candidates: T[],
  budget: number,
  plan: FundingPlan
): SelectionResult<T> {
  const selected: T[] = [];
  const treatedAssets = new Set<string>();
  const byCategory: SelectionResult<T>["byCategory"] = [];
  const outcome = new Map<T, string>();

  let totalSpent = 0;
  let cappedOut = 0;

  for (const pass of fundingPasses(plan)) {
    const cap = pass.share * budget;
    let categorySpent = 0;

    // Everything this pass may consider, still in priority order.
    const inPass = candidates.filter(
      (c) => pass.categories == null || pass.categories.includes(c.option.category)
    );

    // Group by asset once, so rules 3 and 4 are decided per asset rather than
    // rediscovered on every row.
    const byAsset = new Map<string, T[]>();
    for (const candidate of inPass) {
      const list = byAsset.get(candidate.assetId) ?? [];
      list.push(candidate);
      byAsset.set(candidate.assetId, list);
    }

    // Walk assets in the order their best option appears in the ranked list,
    // which is what "start from the top of the list" means once an asset can
    // only be funded once.
    for (const candidate of inPass) {
      if (treatedAssets.has(candidate.assetId)) {
        // Funded in an earlier pass, or by the line above in this one. Rule 2.
        if (!outcome.has(candidate)) outcome.set(candidate, NOT_SELECTED.alreadyTreated);
        continue;
      }

      const onAsset = byAsset.get(candidate.assetId);
      if (!onAsset || onAsset[0] !== candidate) continue; // not this asset's turn yet

      const affordable = (c: T) =>
        c.priority != null &&
        c.cost > 0 &&
        totalSpent + c.cost <= budget &&
        categorySpent + c.cost <= cap;

      // Rule 4 before rule 3 — but inside a tier, never across one.
      //
      // The preference for a bundle is about avoiding a second visit, and that
      // is worth giving up some Priority Score for. It is not worth giving up
      // the difference between work that pays for itself and work that does
      // not. Measured before this was tiered: on one segment at 69 WCI the
      // engine kept buying a $336,012 bundle whose life-cycle saving was
      // −$277,402, passing over a $9,880 valve replacement that saved $81,403,
      // because the bundle was a bundle and reached first.
      const pick = (pool: T[]) =>
        pool.find((c) => c.option.members.length > 1 && affordable(c)) ?? pool.find((c) => affordable(c));

      const paying = onAsset.filter((c) => c.paysForItself);
      const rest = onAsset.filter((c) => !c.paysForItself);
      const chosen = pick(paying) ?? pick(rest);

      if (!chosen) {
        // Nothing on this asset fits. Each option says which wall it hit, at
        // the moment it hit it.
        for (const c of onAsset) {
          if (outcome.has(c)) continue;
          outcome.set(
            c,
            c.priority == null
              ? NOT_SELECTED.unpriced
              : totalSpent + c.cost > budget
                ? NOT_SELECTED.budgetSpent
                : NOT_SELECTED.categoryFull
          );
        }

        // Report it as capped out only when the year still had room —
        // otherwise it is simply the budget.
        const cheapest = onAsset.reduce<T | null>(
          (best, c) => (c.priority != null && (best == null || c.cost < best.cost) ? c : best),
          null
        );
        if (cheapest && totalSpent + cheapest.cost <= budget) cappedOut += cheapest.cost;
        continue;
      }

      selected.push(chosen);
      outcome.set(chosen, SELECTED);
      // Rule 3, and rule 4 where the winner was a bundle: the rest of this
      // asset's options were alternatives to the one that won.
      const beaten = chosen.option.members.length > 1 ? NOT_SELECTED.bundle : NOT_SELECTED.betterOption;
      for (const c of onAsset) if (c !== chosen && !outcome.has(c)) outcome.set(c, beaten);

      treatedAssets.add(chosen.assetId);
      totalSpent += chosen.cost;
      categorySpent += chosen.cost;
    }

    byCategory.push({
      category: pass.categories == null ? "All" : pass.categories[0],
      spent: categorySpent,
      cap,
    });
  }

  // A plan that names only some categories never opens a pass for the rest, so
  // their options were never in the running at all.
  for (const c of candidates) if (!outcome.has(c)) outcome.set(c, NOT_SELECTED.categoryUnfunded);

  return { selected, outcome, byCategory, totalSpent, cappedOut };
}
