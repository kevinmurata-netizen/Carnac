import { prisma } from "@/lib/prisma";
import { CATEGORY_KEYS } from "@/domain/waterline/category-weight";
import {
  strandsBudget,
  unfundedCategories,
  type FundingPlan,
  type FundingStep,
} from "@/domain/waterline/category-funding";
import type { TreatmentCategory } from "@/domain/waterline/treatment";

/**
 * Named category funding plans — ordered categories, each with a share of the
 * year.
 *
 * Structurally the third of these named-preset modules, after weight-sets.ts
 * and category-weight-sets.ts, and it follows their shape: one default, delete
 * refused while in use, resolve never throws. What differs is that a plan owns
 * child rows whose order is the point, so saving replaces the list wholesale.
 */

export type FundingPlanRow = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  steps: FundingStep[];
  /** Categories this plan never funds — capped at zero, or simply left out. */
  unfunded: string[];
  /** Whether the shares total under 100% with nothing able to absorb the rest. */
  strands: boolean;
  scenarioCount: number;
  workPlanCount: number;
};

type Row = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  steps: Array<{ category: string; maxPct: number; position: number }>;
  _count?: { scenarios: number; workPlans: number };
};

function toRow(r: Row): FundingPlanRow {
  const steps: FundingStep[] = [...r.steps]
    .sort((a, b) => a.position - b.position)
    // A category that is no longer in the code — renamed, or a row written by
    // hand — is dropped rather than carried as an unmatchable string. It could
    // never match an option, so keeping it would only make the list lie.
    .filter((s): s is { category: TreatmentCategory; maxPct: number; position: number } =>
      (CATEGORY_KEYS as string[]).includes(s.category)
    )
    .map((s) => ({ category: s.category, maxPct: s.maxPct }));

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isDefault: r.isDefault,
    steps,
    unfunded: unfundedCategories(steps),
    strands: strandsBudget(steps),
    scenarioCount: r._count?.scenarios ?? 0,
    workPlanCount: r._count?.workPlans ?? 0,
  };
}

const withSteps = {
  steps: { select: { category: true, maxPct: true, position: true }, orderBy: { position: "asc" } },
} as const;

export async function listFundingPlans(organizationId: string): Promise<FundingPlanRow[]> {
  const rows = await prisma.categoryFundingPlan.findMany({
    where: { organizationId },
    include: { ...withSteps, _count: { select: { scenarios: true, workPlans: true } } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

/**
 * The plan a scenario runs under, or null.
 *
 * Null — no order at all, one pass down the ranked list — is the honest answer
 * when nothing is chosen and nothing is default. Falling back to some invented
 * order would decide what gets funded on the model's behalf, and category
 * order is exactly the kind of decision that has to be someone's.
 */
export async function resolveFundingPlan(
  organizationId: string,
  planId?: string | null
): Promise<{ plan: FundingPlan; planId: string | null; name: string }> {
  const row = planId
    ? await prisma.categoryFundingPlan.findFirst({ where: { id: planId, organizationId }, include: withSteps })
    : await prisma.categoryFundingPlan.findFirst({
        where: { organizationId, isDefault: true },
        include: withSteps,
      });

  if (!row) return { plan: null, planId: null, name: "No category order" };

  const steps = toRow(row as Row).steps;
  return { plan: steps.length > 0 ? steps : null, planId: row.id, name: row.name };
}

export type FundingPlanInput = {
  name: string;
  description: string | null;
  /** In spending order. Position is taken from the array index, so the caller
   * never has to keep a separate number in step with the list it reordered. */
  steps: FundingStep[];
};

function validate(input: FundingPlanInput) {
  if (!input.name.trim()) throw new Error("Give the funding plan a name");

  const seen = new Set<string>();
  for (const step of input.steps) {
    if (!(CATEGORY_KEYS as string[]).includes(step.category)) {
      throw new Error(`"${step.category}" is not a treatment category`);
    }
    if (seen.has(step.category)) {
      throw new Error(`${step.category} appears twice. A category takes its turn once.`);
    }
    seen.add(step.category);

    if (!Number.isFinite(step.maxPct) || step.maxPct < 0 || step.maxPct > 1) {
      throw new Error(`${step.category}'s share must be between 0% and 100% of the annual budget`);
    }
  }

  if (input.steps.length === 0) {
    throw new Error("Add at least one category. A plan with none funds nothing.");
  }
  if (input.steps.every((s) => s.maxPct === 0)) {
    throw new Error("Every category is at 0%, so a scenario using this plan would fund nothing at all.");
  }
}

async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.categoryFundingPlan.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new Error(`A funding plan named "${clash.name}" already exists`);
}

export async function createFundingPlan(organizationId: string, input: FundingPlanInput): Promise<string> {
  validate(input);
  const name = input.name.trim();
  await assertNameFree(organizationId, name);

  const created = await prisma.categoryFundingPlan.create({
    data: {
      organizationId,
      name,
      description: input.description?.trim() || null,
      steps: {
        create: input.steps.map((s, position) => ({ category: s.category, maxPct: s.maxPct, position })),
      },
    },
    select: { id: true },
  });
  return created.id;
}

/** Steps are replaced wholesale rather than diffed. Reordering is the common
 * edit, and a diff that has to work out "moved from 3 to 1" while positions
 * are unique per plan is a transaction full of collisions for no gain. */
export async function updateFundingPlan(organizationId: string, id: string, input: FundingPlanInput) {
  validate(input);
  const name = input.name.trim();
  const existing = await prisma.categoryFundingPlan.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) throw new Error("That funding plan no longer exists");
  await assertNameFree(organizationId, name, id);

  await prisma.$transaction([
    prisma.categoryFundingStep.deleteMany({ where: { planId: id } }),
    prisma.categoryFundingPlan.update({
      where: { id },
      data: {
        name,
        description: input.description?.trim() || null,
        steps: {
          create: input.steps.map((s, position) => ({ category: s.category, maxPct: s.maxPct, position })),
        },
      },
    }),
  ]);
}

export async function setDefaultFundingPlan(organizationId: string, id: string) {
  const row = await prisma.categoryFundingPlan.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!row) throw new Error("That funding plan no longer exists");

  await prisma.$transaction([
    prisma.categoryFundingPlan.updateMany({ where: { organizationId }, data: { isDefault: false } }),
    prisma.categoryFundingPlan.update({ where: { id }, data: { isDefault: true } }),
  ]);
}

/** There is no default by default, so unlike the weight sets this one can be
 * cleared — "no category order" is a legitimate way to run. */
export async function clearDefaultFundingPlan(organizationId: string) {
  await prisma.categoryFundingPlan.updateMany({ where: { organizationId }, data: { isDefault: false } });
}

export async function deleteFundingPlan(organizationId: string, id: string) {
  const row = await prisma.categoryFundingPlan.findFirst({
    where: { id, organizationId },
    include: { scenarios: { select: { name: true } }, workPlans: { select: { name: true } } },
  });
  if (!row) throw new Error("That funding plan no longer exists");

  const users = [...row.scenarios.map((s) => s.name), ...row.workPlans.map((w) => w.name)];
  if (users.length > 0) {
    throw new Error(
      `"${row.name}" is still used by ${users.sort().join(", ")}. Point those at another plan first — deleting it would move them onto no category order at all and quietly change what they fund.`
    );
  }

  await prisma.categoryFundingPlan.delete({ where: { id } });
}

/** The dropdown's one-line view: the order, with the shares. */
export function describeFundingPlan(plan: FundingPlanRow): string {
  if (plan.steps.length === 0) return "no categories";
  return plan.steps.map((s) => `${s.category} ${Math.round(s.maxPct * 100)}%`).join(" → ");
}
