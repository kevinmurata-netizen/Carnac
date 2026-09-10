import { CATEGORY_KEYS } from "./category-weight";
import type { TreatmentCategory } from "./treatment";

/**
 * How a year's budget is divided between categories, and in what order.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.7.
 *
 * This is the half of category policy that decides what gets *bought*. Its
 * twin, `CategoryWeights`, decides what gets *ranked first*, and the two are
 * deliberately unrelated: a utility can rank renewals highly and still cap them
 * at a fifth of the year, or rank them low and fund whatever survives.
 *
 * Order is the part that is new and the part that matters. Spending works
 * through the categories one at a time. The first takes what it can up to its
 * share, then the second, and so on — so a plan reading "Repair 20%, then
 * Rehabilitate 40%, then Renew 100%" buys a fifth of a year of patching, then
 * up to two fifths of relining, then puts everything still unspent into
 * replacement.
 */
export type FundingStep = {
  category: TreatmentCategory;
  /** Share of the year's budget, 0–1. */
  maxPct: number;
};

/** No plan: one pass down the whole ranked list, ignoring category entirely.
 * What allocation did before order existed, and what a scenario that has not
 * chosen a plan still does. */
export type FundingPlan = FundingStep[] | null;

/** Clamped to 0–1. Above 100% says nothing the budget does not already say;
 * below zero has no reading at all. */
export function stepShare(step: FundingStep): number {
  if (!Number.isFinite(step.maxPct) || step.maxPct < 0) return 1;
  return Math.min(1, step.maxPct);
}

/**
 * The passes to make over the ranked list, in order.
 *
 * A plan with no steps and a null plan both come back as one pass over
 * everything, because an empty ordered list is not a statement that nothing
 * may be funded — it is a plan nobody finished writing, and refusing to fund
 * anything would be a surprising way to say so.
 */
export function fundingPasses(plan: FundingPlan): Array<{
  /** Null means "every category", the single-pass case. */
  categories: TreatmentCategory[] | null;
  share: number;
}> {
  if (plan == null || plan.length === 0) return [{ categories: null, share: 1 }];
  return plan.map((step) => ({ categories: [step.category], share: stepShare(step) }));
}

/**
 * Categories a plan never funds at all: capped at zero, or simply absent.
 *
 * An absent category is the easier one to get wrong. A plan listing only
 * Repair and Renew silently means "no relining, ever", and a screen that did
 * not say so would leave someone to work it out from an empty column.
 */
export function unfundedCategories(plan: FundingPlan): TreatmentCategory[] {
  if (plan == null || plan.length === 0) return [];
  const byCategory = new Map(plan.map((s) => [s.category, stepShare(s)]));
  return CATEGORY_KEYS.filter((c) => (byCategory.get(c) ?? 0) === 0);
}

/**
 * Whether the shares can leave money unspent.
 *
 * Shares are of the whole year, not of each other, so they need not sum to
 * 100% — and a category at 100% late in the order is the usual way to make
 * sure nothing is stranded. But if every share is below 100% and they total
 * less than 100%, the shortfall genuinely cannot be spent, and that is worth
 * saying out loud rather than leaving to be noticed in a run.
 */
export function strandsBudget(plan: FundingPlan): boolean {
  if (plan == null || plan.length === 0) return false;
  const total = plan.reduce((sum, s) => sum + stepShare(s), 0);
  return total < 1 && plan.every((s) => stepShare(s) < 1);
}
