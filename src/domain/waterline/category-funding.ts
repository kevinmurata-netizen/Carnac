import { CATEGORY_KEYS } from "./category-weight";
import type { TreatmentCategory } from "./treatment";

/**
 * The most of a year's budget each category may take.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.7.
 *
 * This is the half of category policy that limits what gets *bought*. Its
 * twin, `CategoryWeights`, changes what gets *scored* higher, and the two are
 * deliberately unrelated: a utility can weight renewals highly and still cap
 * them at a fifth of the year, or weight them low and fund whatever survives.
 *
 * A share is a limit, not a turn. The year's work is chosen across every
 * category at once by incremental benefit/cost (see ./selection.ts), and no
 * category may take more than its share. Plans used to be spent in order —
 * the first category taking what it could, then the next — but that let a
 * cheap patch in an early category claim a segment before a relining worth
 * far more could be considered, so the order a plan lists its categories in
 * now changes nothing.
 */
export type FundingStep = {
  category: TreatmentCategory;
  /** Share of the year's budget, 0–1. */
  maxPct: number;
};

/** No plan: no category limits, only the year's budget. What a scenario that
 * has not chosen a plan does. */
export type FundingPlan = FundingStep[] | null;

/** Clamped to 0–1. Above 100% says nothing the budget does not already say;
 * below zero has no reading at all. */
export function stepShare(step: FundingStep): number {
  if (!Number.isFinite(step.maxPct) || step.maxPct < 0) return 1;
  return Math.min(1, step.maxPct);
}

/**
 * Each listed category's limit for one year, in dollars. A category the plan
 * does not list has no entry, and so may spend nothing.
 *
 * Null — no limits at all — for a null plan and for a plan with no steps: an
 * empty plan is not a statement that nothing may be funded, it is a plan
 * nobody finished writing, and refusing to fund anything would be a
 * surprising way to say so.
 */
export function categoryLimits(plan: FundingPlan, budget: number): Map<TreatmentCategory, number> | null {
  if (plan == null || plan.length === 0) return null;
  return new Map(plan.map((step) => [step.category, stepShare(step) * budget]));
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
 * 100% — and one category at 100% is the usual way to make sure nothing is
 * stranded. But if every share is below 100% and they total
 * less than 100%, the shortfall genuinely cannot be spent, and that is worth
 * saying out loud rather than leaving to be noticed in a run.
 */
export function strandsBudget(plan: FundingPlan): boolean {
  if (plan == null || plan.length === 0) return false;
  const total = plan.reduce((sum, s) => sum + stepShare(s), 0);
  return total < 1 && plan.every((s) => stepShare(s) < 1);
}
