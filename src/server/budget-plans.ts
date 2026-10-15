import { prisma } from "@/lib/prisma";
import { CATEGORY_KEYS } from "@/domain/waterline/category-weight";
import { budgetLineProblem, budgetYears, type BudgetPlanLine } from "@/domain/waterline/budget-plan";
import type { TreatmentCategory } from "@/domain/waterline/treatment";

/**
 * Named budget plans — the money a utility expects to have, year by year.
 *
 * Shaped like the other named presets a scenario chooses from (funding plans,
 * lead-time sets): lines replaced wholesale on save, delete refused while a
 * scenario follows the plan, resolve never throws. There is no default: a
 * scenario follows a budget plan only when someone chooses one for it.
 */

export type BudgetPlanRow = {
  id: string;
  name: string;
  description: string | null;
  lines: BudgetPlanLine[];
  /** The years it lists, in order. */
  years: number[];
  /** Its total across those years. */
  total: number;
  scenarioCount: number;
};

type Row = {
  id: string;
  name: string;
  description: string | null;
  lines: Array<{ year: number; assetTypeId: string | null; category: string | null; amount: number }>;
  _count?: { scenarios: number };
};

const isCategory = (c: string | null): c is TreatmentCategory | null =>
  c == null || (CATEGORY_KEYS as string[]).includes(c);

function toLines(rows: Row["lines"]): BudgetPlanLine[] {
  return rows
    // A category no longer in the code could never match an option, so it is
    // dropped rather than carried as an unmatchable string.
    .filter((l) => isCategory(l.category))
    .map((l) => ({ year: l.year, assetTypeId: l.assetTypeId, category: l.category as TreatmentCategory | null, amount: l.amount }))
    .sort((a, b) => a.year - b.year || (a.category ?? "").localeCompare(b.category ?? ""));
}

/** A year's money as the plan sets it: its total, or its categories summed. */
function yearTotal(lines: BudgetPlanLine[], year: number): number {
  const inYear = lines.filter((l) => l.year === year && l.assetTypeId == null);
  const total = inYear.find((l) => l.category == null);
  return total ? total.amount : inYear.reduce((sum, l) => sum + l.amount, 0);
}

function toRow(r: Row): BudgetPlanRow {
  const lines = toLines(r.lines);
  const years = budgetYears(lines);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    lines,
    years,
    total: years.reduce((sum, y) => sum + yearTotal(lines, y), 0),
    scenarioCount: r._count?.scenarios ?? 0,
  };
}

const include = { lines: true, _count: { select: { scenarios: true } } } as const;

export async function listBudgetPlans(organizationId: string): Promise<BudgetPlanRow[]> {
  const rows = await prisma.budgetPlan.findMany({ where: { organizationId }, include, orderBy: { name: "asc" } });
  return rows.map(toRow);
}

export async function getBudgetPlan(organizationId: string, id: string): Promise<BudgetPlanRow | null> {
  const row = await prisma.budgetPlan.findFirst({ where: { id, organizationId }, include });
  return row ? toRow(row) : null;
}

/** A plan as a scenario chooses it: what it covers, said in a few words. */
export type BudgetPlanChoice = { id: string; name: string; summary: string };

export function toBudgetPlanChoice(plan: BudgetPlanRow): BudgetPlanChoice {
  const span =
    plan.years.length === 0
      ? "no years yet"
      : plan.years.length === 1
        ? String(plan.years[0])
        : `${plan.years[0]}–${plan.years[plan.years.length - 1]}`;
  return { id: plan.id, name: plan.name, summary: span };
}

/**
 * The lines a scenario runs under, or null when it follows no plan — or one
 * since deleted, which reads the same as never having chosen one.
 */
export async function resolveBudgetPlan(
  organizationId: string,
  planId: string | null | undefined
): Promise<{ lines: BudgetPlanLine[] | null; name: string | null }> {
  if (!planId) return { lines: null, name: null };
  const row = await prisma.budgetPlan.findFirst({ where: { id: planId, organizationId }, include: { lines: true } });
  if (!row) return { lines: null, name: null };
  return { lines: toLines(row.lines), name: row.name };
}

export type BudgetPlanInput = {
  name: string;
  description: string | null;
  lines: BudgetPlanLine[];
};

function validate(input: BudgetPlanInput) {
  if (!input.name.trim()) throw new Error("Give the budget a name");
  if (input.lines.length === 0) throw new Error("Enter an amount for at least one year");
  if (input.lines.some((l) => l.assetTypeId != null)) {
    throw new Error("Amounts by asset type are not available yet");
  }
  const problem = budgetLineProblem(input.lines);
  if (problem) throw new Error(problem);
}

async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.budgetPlan.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new Error(`A budget named "${clash.name}" already exists`);
}

const lineData = (lines: BudgetPlanLine[]) =>
  lines.map((l) => ({ year: l.year, assetTypeId: l.assetTypeId, category: l.category, amount: l.amount }));

export async function createBudgetPlan(organizationId: string, input: BudgetPlanInput): Promise<string> {
  validate(input);
  const name = input.name.trim();
  await assertNameFree(organizationId, name);
  const created = await prisma.budgetPlan.create({
    data: {
      organizationId,
      name,
      description: input.description?.trim() || null,
      lines: { create: lineData(input.lines) },
    },
    select: { id: true },
  });
  return created.id;
}

/** Lines are replaced wholesale: the screen edits the whole table at once. */
export async function updateBudgetPlan(organizationId: string, id: string, input: BudgetPlanInput) {
  validate(input);
  const name = input.name.trim();
  const existing = await prisma.budgetPlan.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("That budget no longer exists");
  await assertNameFree(organizationId, name, id);
  await prisma.$transaction([
    prisma.budgetPlanLine.deleteMany({ where: { budgetPlanId: id } }),
    prisma.budgetPlan.update({
      where: { id },
      data: { name, description: input.description?.trim() || null, lines: { create: lineData(input.lines) } },
    }),
  ]);
}

/** Refused while a scenario follows it: taking the plan away would quietly put
 * that scenario back on its annual budget, and its stored results would no
 * longer say what it now does. */
export async function deleteBudgetPlan(organizationId: string, id: string) {
  const plan = await prisma.budgetPlan.findFirst({
    where: { id, organizationId },
    include: { scenarios: { select: { name: true }, take: 3 }, _count: { select: { scenarios: true } } },
  });
  if (!plan) throw new Error("That budget no longer exists");
  if (plan._count.scenarios > 0) {
    const names = plan.scenarios.map((s) => s.name).join(", ");
    const more = plan._count.scenarios > plan.scenarios.length ? ` and ${plan._count.scenarios - plan.scenarios.length} more` : "";
    const verb = plan._count.scenarios === 1 ? "follows" : "follow";
    throw new Error(`${names}${more} ${verb} this budget. Choose another for ${plan._count.scenarios === 1 ? "it" : "them"} before deleting it.`);
  }
  await prisma.budgetPlan.delete({ where: { id } });
}

/** Whether a plan belongs to this organization — checked before a scenario
 * is pointed at it. */
export async function assertBudgetPlanInOrganization(organizationId: string, id: string | null) {
  if (!id) return;
  const plan = await prisma.budgetPlan.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!plan) throw new Error("That budget isn't one this organization has");
}
