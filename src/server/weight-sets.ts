import { prisma } from "@/lib/prisma";
import { DEFAULT_WEIGHTS, type ObjectiveWeights } from "@/domain/waterline/optimization";

/**
 * Named sets of objective weights.
 *
 * A weighting is a policy decision — "we chase risk" versus "we chase
 * life-cycle cost" — and it used to be four numbers typed into a form and
 * forgotten. Naming it lets two scenarios be compared on what they treat as
 * important, and lets a saved work plan say which policy produced it.
 *
 * See docs/TREATMENT-MODEL-REBUILD.md §5.3.
 */

export type WeightSetRow = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  weights: ObjectiveWeights;
  /** How many scenarios and plans point at it, so deleting one can say what it
   * would orphan. */
  scenarioCount: number;
  workPlanCount: number;
};

type Row = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  conditionImprovement: number;
  riskReduction: number;
  lifeCycleCost: number;
  criticality: number;
  _count?: { scenarios: number; workPlans: number };
};

function toRow(r: Row): WeightSetRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    isDefault: r.isDefault,
    weights: {
      conditionImprovement: r.conditionImprovement,
      riskReduction: r.riskReduction,
      lifeCycleCost: r.lifeCycleCost,
      criticality: r.criticality,
    },
    scenarioCount: r._count?.scenarios ?? 0,
    workPlanCount: r._count?.workPlans ?? 0,
  };
}

export async function listWeightSets(organizationId: string): Promise<WeightSetRow[]> {
  const rows = await prisma.scenarioWeightSet.findMany({
    where: { organizationId },
    include: { _count: { select: { scenarios: true, workPlans: true } } },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

export async function getWeightSet(organizationId: string, id: string): Promise<WeightSetRow | null> {
  const row = await prisma.scenarioWeightSet.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { scenarios: true, workPlans: true } } },
  });
  return row ? toRow(row) : null;
}

/**
 * The weights to use when nobody chose: the organization's default set, or the
 * shipped constant if it has none.
 *
 * Never throws and never returns nothing. A missing weight set should not stop
 * a work plan generating — it should quietly rank the way it always did.
 */
export async function resolveWeights(
  organizationId: string,
  weightSetId?: string | null
): Promise<{ weights: ObjectiveWeights; weightSetId: string | null; name: string }> {
  const row = weightSetId
    ? await prisma.scenarioWeightSet.findFirst({ where: { id: weightSetId, organizationId } })
    : await prisma.scenarioWeightSet.findFirst({ where: { organizationId, isDefault: true } });

  if (!row) return { weights: { ...DEFAULT_WEIGHTS }, weightSetId: null, name: "Balanced (built-in)" };
  return { weights: toRow(row).weights, weightSetId: row.id, name: row.name };
}

export type WeightSetInput = {
  name: string;
  description: string | null;
  weights: ObjectiveWeights;
};

/** Weights are normalized on use, so what matters here is that they are
 * non-negative and not all zero — a set of four zeroes would silently rank by
 * the built-in defaults instead of by what it says. */
function validate(input: WeightSetInput) {
  if (!input.name.trim()) throw new Error("Give the weight set a name");

  const values = Object.values(input.weights);
  if (values.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error("Every weight must be zero or more");
  }
  if (values.reduce((a, b) => a + b, 0) <= 0) {
    throw new Error(
      "At least one weight must be above zero. A set of zeroes ranks by the built-in defaults rather than by what it says, which is worse than being told to fix it."
    );
  }
}

async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.scenarioWeightSet.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new Error(`A weight set named "${clash.name}" already exists`);
}

export async function createWeightSet(organizationId: string, input: WeightSetInput): Promise<string> {
  validate(input);
  const name = input.name.trim();
  await assertNameFree(organizationId, name);

  const created = await prisma.scenarioWeightSet.create({
    data: {
      organizationId,
      name,
      description: input.description?.trim() || null,
      ...input.weights,
    },
    select: { id: true },
  });
  return created.id;
}

export async function updateWeightSet(organizationId: string, id: string, input: WeightSetInput) {
  validate(input);
  const name = input.name.trim();
  const existing = await prisma.scenarioWeightSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("That weight set no longer exists");
  await assertNameFree(organizationId, name, id);

  await prisma.scenarioWeightSet.update({
    where: { id },
    data: { name, description: input.description?.trim() || null, ...input.weights },
  });
}

/** Exactly one default, swapped in one transaction so there is never a moment
 * with two or none. */
export async function setDefaultWeightSet(organizationId: string, id: string) {
  const row = await prisma.scenarioWeightSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!row) throw new Error("That weight set no longer exists");

  await prisma.$transaction([
    prisma.scenarioWeightSet.updateMany({ where: { organizationId }, data: { isDefault: false } }),
    prisma.scenarioWeightSet.update({ where: { id }, data: { isDefault: true } }),
  ]);
}

/**
 * Deleting is refused while anything points at the set, naming what does.
 *
 * The foreign keys are `SET NULL`, so a delete would succeed and silently move
 * those scenarios onto the default — changing what they rank by without saying
 * so. Same shape as deleting a rule that still gates a treatment.
 */
export async function deleteWeightSet(organizationId: string, id: string) {
  const row = await prisma.scenarioWeightSet.findFirst({
    where: { id, organizationId },
    include: {
      scenarios: { select: { name: true } },
      workPlans: { select: { name: true } },
      _count: { select: { scenarios: true, workPlans: true } },
    },
  });
  if (!row) throw new Error("That weight set no longer exists");

  if (row.isDefault) {
    throw new Error(
      `"${row.name}" is the default weighting. Make another set the default first — deleting it would leave nothing to fall back on.`
    );
  }

  const users = [...row.scenarios.map((s) => s.name), ...row.workPlans.map((w) => w.name)];
  if (users.length > 0) {
    throw new Error(
      `"${row.name}" is still used by ${users.sort().join(", ")}. Point those at another set first — deleting it would move them onto the default and quietly change what they rank by.`
    );
  }

  await prisma.scenarioWeightSet.delete({ where: { id } });
}
