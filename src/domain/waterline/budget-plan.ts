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
 * year. With an asset type it is that type's money for the year, and with
 * both, the most that category may take within the type — read only by a
 * scenario that funds its types separately.
 */
export type BudgetPlanLine = {
  year: number;
  assetTypeId: string | null;
  category: TreatmentCategory | null;
  amount: number;
};

/** How a scenario over several asset types spends a budget that sets money
 * per type: from one pot, or each type from its own. */
export const TYPE_FUNDING = ["pooled", "separate"] as const;
export type TypeFunding = (typeof TYPE_FUNDING)[number];

/** Each asset type's money for a year, where a scenario funds them
 * separately. */
export type TypeLimits = {
  /** The most each listed type may take, by asset type id. A type the year
   * does not list is held only by the year's total. */
  byType: Map<string, number>;
  /** The most a category may take within a type, keyed "typeId|category". */
  byTypeCategory: Map<string, number>;
};

/** What a plan says about one year. */
export type BudgetYear = {
  /** The year's money: its total line, or its category lines added up, or
   * its types' money added up — whichever it gives first. */
  total: number;
  /** The most each listed category may take, in dollars. A category the year
   * does not list is held only by the total. */
  ceilings: Map<TreatmentCategory, number>;
  /** Each type's money, when the scenario funds types separately and the year
   * sets any. Null otherwise: pooled, the types share the year's money. */
  types: TypeLimits | null;
};

/** A group of lines' money: its total line, or its category lines added up. */
function groupMoney(group: BudgetPlanLine[]): number | null {
  if (group.length === 0) return null;
  const total = group.find((l) => l.category == null);
  return total ? total.amount : group.reduce((sum, l) => sum + l.amount, 0);
}

/**
 * The plan's figures for one year, or null when the plan does not list it —
 * in which case the scenario's own annual budget and growth apply.
 */
export function budgetYear(
  lines: BudgetPlanLine[] | null | undefined,
  year: number,
  typeFunding: TypeFunding = "pooled"
): BudgetYear | null {
  if (!lines) return null;
  const inYear = lines.filter((l) => l.year === year);
  if (inYear.length === 0) return null;

  const overall = inYear.filter((l) => l.assetTypeId == null);
  const typeIds = [...new Set(inYear.filter((l) => l.assetTypeId != null).map((l) => l.assetTypeId!))];
  const typeMoney = new Map(
    typeIds.map((id) => [id, groupMoney(inYear.filter((l) => l.assetTypeId === id))!] as const)
  );

  const ceilings = new Map<TreatmentCategory, number>();
  for (const l of overall) if (l.category != null) ceilings.set(l.category, l.amount);
  const total = groupMoney(overall) ?? [...typeMoney.values()].reduce((sum, v) => sum + v, 0);

  let types: TypeLimits | null = null;
  if (typeFunding === "separate" && typeIds.length > 0) {
    const byTypeCategory = new Map<string, number>();
    for (const l of inYear) {
      if (l.assetTypeId != null && l.category != null) byTypeCategory.set(`${l.assetTypeId}|${l.category}`, l.amount);
    }
    types = { byType: typeMoney, byTypeCategory };
  }
  return { total, ceilings, types };
}

/** The years a plan lists, in order. */
export function budgetYears(lines: BudgetPlanLine[]): number[] {
  return [...new Set(lines.map((l) => l.year))].sort((a, b) => a - b);
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
