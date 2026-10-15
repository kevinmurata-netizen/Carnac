import type { TreatmentCategory } from "./treatment";

/**
 * A budget plan: the money a utility expects to have, set year by year in
 * dollars rather than as one figure and a growth rate.
 *
 * Optional on a scenario. A year the plan lists replaces the scenario's
 * annual budget and growth for that year; a year it does not list falls back
 * to them, so a five-year capital plan can sit in front of a twenty-year run.
 */

/** The categories a budget can set aside money for: the capital work a
 * scenario funds. Assess and Retire are never funded by a scenario. */
export const BUDGET_CATEGORIES = ["Repair", "Rehabilitate", "Renew"] as const satisfies readonly TreatmentCategory[];

export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

/**
 * One amount for one year. With no asset type and no category it is the
 * year's total; with a category it is the most that category may take that
 * year. Lines for an asset type are stored but not yet read.
 */
export type BudgetPlanLine = {
  year: number;
  assetTypeId: string | null;
  category: TreatmentCategory | null;
  amount: number;
};

/** What a plan says about one year. */
export type BudgetYear = {
  /** The year's money: its total line, or the sum of its category lines
   * where it gives no total. */
  total: number;
  /** The most each listed category may take, in dollars. A category the year
   * does not list is held only by the total. */
  ceilings: Map<TreatmentCategory, number>;
};

/**
 * The plan's figures for one year, or null when the plan does not list it —
 * in which case the scenario's own annual budget and growth apply.
 */
export function budgetYear(lines: BudgetPlanLine[] | null | undefined, year: number): BudgetYear | null {
  if (!lines) return null;
  const inYear = lines.filter((l) => l.year === year && l.assetTypeId == null);
  if (inYear.length === 0) return null;
  const totalLine = inYear.find((l) => l.category == null);
  const ceilings = new Map<TreatmentCategory, number>();
  for (const l of inYear) if (l.category != null) ceilings.set(l.category, l.amount);
  const total = totalLine ? totalLine.amount : [...ceilings.values()].reduce((sum, v) => sum + v, 0);
  return { total, ceilings };
}

/** The years a plan lists, in order. */
export function budgetYears(lines: BudgetPlanLine[]): number[] {
  return [...new Set(lines.filter((l) => l.assetTypeId == null).map((l) => l.year))].sort((a, b) => a - b);
}

/**
 * Lines checked before they are stored: whole years, amounts of zero or more,
 * capital categories only, and one line per year and category.
 */
export function budgetLineProblem(lines: BudgetPlanLine[]): string | null {
  const seen = new Set<string>();
  for (const l of lines) {
    if (!Number.isInteger(l.year) || l.year < 1900 || l.year > 2200) return `${l.year} is not a year a budget can cover`;
    if (!Number.isFinite(l.amount) || l.amount < 0) return `Every amount must be a dollar figure of zero or more (${l.year})`;
    if (l.category != null && !(BUDGET_CATEGORIES as readonly string[]).includes(l.category)) {
      return `A budget sets money aside for ${BUDGET_CATEGORIES.join(", ")} — not ${l.category}`;
    }
    const key = `${l.year}|${l.assetTypeId ?? ""}|${l.category ?? ""}`;
    if (seen.has(key)) return `${l.year} has ${l.category ?? "a total"} twice`;
    seen.add(key);
  }
  return null;
}
