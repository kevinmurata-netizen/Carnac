import { prisma } from "@/lib/prisma";
import {
  CATEGORY_KEYS,
  NEUTRAL_CATEGORY_WEIGHTS,
  UNCAPPED,
  cappedCategories,
  excludedCategories,
  type CategoryCaps,
  type CategoryWeights,
} from "@/domain/waterline/category-weight";

/**
 * Named sets of category weights.
 *
 * Structurally the twin of weight-sets.ts and deliberately so — the same CRUD,
 * the same one-default rule, the same refusal to delete something in use. What
 * differs is arithmetic, not shape: these are multipliers rather than shares,
 * so nothing here normalizes and a set of all zeroes is refused for a different
 * reason (it would fund nothing at all, not fall back to a default).
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.4.
 */

export type CategoryWeightSetRow = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  weights: CategoryWeights;
  /** The most of one year's budget each category may take. */
  caps: CategoryCaps;
  /** Categories this set switches off, so the list can say so rather than
   * leaving someone to discover it from an empty plan. */
  excluded: string[];
  /** Categories this set limits the spend on, as distinct from switching off. */
  capped: string[];
  scenarioCount: number;
  workPlanCount: number;
};

type Row = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  assess: number;
  repair: number;
  rehabilitate: number;
  renew: number;
  retire: number;
  assessCap: number;
  repairCap: number;
  rehabilitateCap: number;
  renewCap: number;
  retireCap: number;
  _count?: { scenarios: number; workPlans: number };
};

function toWeights(r: Row): CategoryWeights {
  return {
    Assess: r.assess,
    Repair: r.repair,
    Rehabilitate: r.rehabilitate,
    Renew: r.renew,
    Retire: r.retire,
  };
}

function toCaps(r: Row): CategoryCaps {
  return {
    Assess: r.assessCap,
    Repair: r.repairCap,
    Rehabilitate: r.rehabilitateCap,
    Renew: r.renewCap,
    Retire: r.retireCap,
  };
}

/** The column names are the category names lower-cased; kept in one place so
 * the mapping is written once rather than at every call site. */
function toColumns(weights: CategoryWeights, caps: CategoryCaps) {
  return {
    assess: weights.Assess,
    repair: weights.Repair,
    rehabilitate: weights.Rehabilitate,
    renew: weights.Renew,
    retire: weights.Retire,
    assessCap: caps.Assess,
    repairCap: caps.Repair,
    rehabilitateCap: caps.Rehabilitate,
    renewCap: caps.Renew,
    retireCap: caps.Retire,
  };
}

function toRow(r: Row): CategoryWeightSetRow {
  const weights = toWeights(r);
  const caps = toCaps(r);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isDefault: r.isDefault,
    weights,
    caps,
    excluded: excludedCategories(weights),
    capped: cappedCategories(caps),
    scenarioCount: r._count?.scenarios ?? 0,
    workPlanCount: r._count?.workPlans ?? 0,
  };
}

export async function listCategoryWeightSets(organizationId: string): Promise<CategoryWeightSetRow[]> {
  const rows = await prisma.categoryWeightSet.findMany({
    where: { organizationId },
    include: { _count: { select: { scenarios: true, workPlans: true } } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

export async function getCategoryWeightSet(
  organizationId: string,
  id: string
): Promise<CategoryWeightSetRow | null> {
  const row = await prisma.categoryWeightSet.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { scenarios: true, workPlans: true } } },
  });
  return row ? toRow(row) : null;
}

/**
 * The category weights to use when nobody chose: the organization's default
 * set, or all ones.
 *
 * Never throws and never returns nothing, for the same reason `resolveWeights`
 * does not — a missing set should quietly rank the way the model did before
 * category weights existed, not stop a plan generating.
 */
export async function resolveCategoryWeights(
  organizationId: string,
  categoryWeightSetId?: string | null
): Promise<{
  weights: CategoryWeights;
  caps: CategoryCaps;
  categoryWeightSetId: string | null;
  name: string;
}> {
  const row = categoryWeightSetId
    ? await prisma.categoryWeightSet.findFirst({ where: { id: categoryWeightSetId, organizationId } })
    : await prisma.categoryWeightSet.findFirst({ where: { organizationId, isDefault: true } });

  if (!row) {
    return {
      weights: { ...NEUTRAL_CATEGORY_WEIGHTS },
      caps: { ...UNCAPPED },
      categoryWeightSetId: null,
      name: "Even-handed (built-in)",
    };
  }
  return { weights: toWeights(row), caps: toCaps(row), categoryWeightSetId: row.id, name: row.name };
}

/**
 * A set as a dropdown option.
 *
 * The summary names only the categories that were actually moved. Listing all
 * five would make every option the same length and hide the one thing that
 * distinguishes them; a set that moved nothing says so in words instead.
 * Zeroed categories are left out here because they are reported separately and
 * more loudly — "no Renew" is not a weighting, it is an exclusion.
 */
export function toCategoryChoice(set: CategoryWeightSetRow) {
  const adjusted = CATEGORY_KEYS.filter((k) => set.weights[k] !== 1 && set.weights[k] !== 0);
  const caps = CATEGORY_KEYS.filter((k) => set.caps[k] < 1).map(
    (k) => `${k} ≤ ${Math.round(set.caps[k] * 100)}%`
  );

  const weightPart =
    adjusted.length === 0
      ? set.excluded.length > 0
        ? "otherwise even"
        : "every category even"
      : adjusted.map((k) => `${k} ×${set.weights[k]}`).join(", ");

  return {
    id: set.id,
    name: set.name,
    isDefault: set.isDefault,
    summary: caps.length === 0 ? weightPart : `${weightPart}; ${caps.join(", ")}`,
    excluded: set.excluded,
  };
}

export type CategoryWeightSetInput = {
  name: string;
  description: string | null;
  weights: CategoryWeights;
  caps: CategoryCaps;
};

/**
 * A weight is a multiplier, so the bounds are different from the objective
 * weights next door.
 *
 * Negative is refused outright: it would flip the sign of the Priority Score
 * and rank the best option in that category last, which nobody means by
 * "count this less". All-zero is refused because it funds nothing — unlike the
 * objective weights, where all-zero silently falls back to the built-in split,
 * here it produces a genuinely empty plan and being told is better than
 * discovering it after a run.
 */
function validate(input: CategoryWeightSetInput) {
  if (!input.name.trim()) throw new Error("Give the category weighting a name");

  for (const key of CATEGORY_KEYS) {
    const v = input.weights[key];
    if (!Number.isFinite(v) || v < 0) {
      throw new Error(`${key} must be zero or more — a negative weight would rank that work backwards`);
    }
    if (v > 100) {
      throw new Error(`${key} is ${v}, which is almost certainly a typo. Weights are multipliers, not percentages.`);
    }
  }

  for (const key of CATEGORY_KEYS) {
    const c = input.caps[key];
    if (!Number.isFinite(c) || c < 0 || c > 1) {
      throw new Error(`${key}'s budget cap must be between 0% and 100% of the annual budget`);
    }
  }

  if (CATEGORY_KEYS.every((k) => input.caps[k] === 0)) {
    throw new Error(
      "Every category is capped at 0% of the budget, so a plan using this weighting would fund nothing at all."
    );
  }

  if (CATEGORY_KEYS.every((k) => input.weights[k] === 0)) {
    throw new Error(
      "Every category is zero, so this weighting funds nothing at all. Leave at least one above zero."
    );
  }
}

async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.categoryWeightSet.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new Error(`A category weighting named "${clash.name}" already exists`);
}

export async function createCategoryWeightSet(
  organizationId: string,
  input: CategoryWeightSetInput
): Promise<string> {
  validate(input);
  const name = input.name.trim();
  await assertNameFree(organizationId, name);

  const created = await prisma.categoryWeightSet.create({
    data: {
      organizationId,
      name,
      description: input.description?.trim() || null,
      ...toColumns(input.weights, input.caps),
    },
    select: { id: true },
  });
  return created.id;
}

export async function updateCategoryWeightSet(
  organizationId: string,
  id: string,
  input: CategoryWeightSetInput
) {
  validate(input);
  const name = input.name.trim();
  const existing = await prisma.categoryWeightSet.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) throw new Error("That category weighting no longer exists");
  await assertNameFree(organizationId, name, id);

  await prisma.categoryWeightSet.update({
    where: { id },
    data: { name, description: input.description?.trim() || null, ...toColumns(input.weights, input.caps) },
  });
}

/** Exactly one default, swapped in one transaction so there is never a moment
 * with two or none. */
export async function setDefaultCategoryWeightSet(organizationId: string, id: string) {
  const row = await prisma.categoryWeightSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!row) throw new Error("That category weighting no longer exists");

  await prisma.$transaction([
    prisma.categoryWeightSet.updateMany({ where: { organizationId }, data: { isDefault: false } }),
    prisma.categoryWeightSet.update({ where: { id }, data: { isDefault: true } }),
  ]);
}

/**
 * Deleting is refused while anything points at the set, naming what does.
 *
 * The foreign keys are `SET NULL`, so a delete would succeed and silently move
 * those scenarios onto the default — changing what they fund without saying so.
 */
export async function deleteCategoryWeightSet(organizationId: string, id: string) {
  const row = await prisma.categoryWeightSet.findFirst({
    where: { id, organizationId },
    include: {
      scenarios: { select: { name: true } },
      workPlans: { select: { name: true } },
    },
  });
  if (!row) throw new Error("That category weighting no longer exists");

  if (row.isDefault) {
    throw new Error(
      `"${row.name}" is the default category weighting. Make another set the default first — deleting it would leave nothing to fall back on.`
    );
  }

  const users = [...row.scenarios.map((s) => s.name), ...row.workPlans.map((w) => w.name)];
  if (users.length > 0) {
    throw new Error(
      `"${row.name}" is still used by ${users.sort().join(", ")}. Point those at another set first — deleting it would move them onto the default and quietly change what they fund.`
    );
  }

  await prisma.categoryWeightSet.delete({ where: { id } });
}
