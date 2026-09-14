import { prisma } from "@/lib/prisma";
import {
  BASE_YEAR_MAX,
  BASE_YEAR_MIN,
  PERIOD_MAX,
  PERIOD_MIN,
  SCENARIO_SET_STATUSES,
  type ScenarioSetStatusValue,
} from "@/lib/scenario-sets";

/**
 * Scenario sets: scenarios grouped to be compared over one planning window.
 *
 * The set governs the window. A member runs from the set's base year for the
 * set's planning period, and its own analysis period is kept but ignored
 * until it leaves — so taking a scenario out of a set gives back exactly what
 * it had, rather than whatever the set happened to impose.
 */

export type ScenarioSetSummary = {
  id: string;
  name: string;
  description: string | null;
  baseYear: number;
  planningPeriodYears: number;
  status: ScenarioSetStatusValue;
  scenarioCount: number;
  updatedAt: Date;
};

export type ScenarioSetInput = {
  name: string;
  description?: string | null;
  baseYear: number;
  planningPeriodYears: number;
  status: ScenarioSetStatusValue;
};

export async function listScenarioSets(organizationId: string): Promise<ScenarioSetSummary[]> {
  const sets = await prisma.scenarioSet.findMany({
    where: { organizationId },
    include: { _count: { select: { scenarios: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    sets
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        baseYear: s.baseYear,
        planningPeriodYears: s.planningPeriodYears,
        status: s.status,
        scenarioCount: s._count.scenarios,
        updatedAt: s.updatedAt,
      }))
      // Archived sets last: kept for the record, not for working in. Stable, so
      // creation order holds within each group.
      .sort((a, b) => Number(a.status === "ARCHIVED") - Number(b.status === "ARCHIVED"))
  );
}

export async function getScenarioSet(organizationId: string, id: string): Promise<ScenarioSetSummary | null> {
  const s = await prisma.scenarioSet.findFirst({
    where: { id, organizationId },
    include: { _count: { select: { scenarios: true } } },
  });
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    baseYear: s.baseYear,
    planningPeriodYears: s.planningPeriodYears,
    status: s.status,
    scenarioCount: s._count.scenarios,
    updatedAt: s.updatedAt,
  };
}

function validate(input: ScenarioSetInput): ScenarioSetInput {
  const name = input.name.trim();
  if (!name) throw new Error("Scenario set name is required");
  if (!Number.isInteger(input.baseYear) || input.baseYear < BASE_YEAR_MIN || input.baseYear > BASE_YEAR_MAX) {
    throw new Error(`Base year must be a whole year between ${BASE_YEAR_MIN} and ${BASE_YEAR_MAX}`);
  }
  if (
    !Number.isInteger(input.planningPeriodYears) ||
    input.planningPeriodYears < PERIOD_MIN ||
    input.planningPeriodYears > PERIOD_MAX
  ) {
    throw new Error(`Planning period must be between ${PERIOD_MIN} and ${PERIOD_MAX} years`);
  }
  if (!SCENARIO_SET_STATUSES.includes(input.status)) throw new Error("Unknown status");
  return { ...input, name, description: input.description?.trim() || null };
}

/** A clearer refusal than the unique constraint's. */
async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.scenarioSet.findFirst({
    where: { organizationId, name, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new Error(`A scenario set called “${name}” already exists`);
}

export async function createScenarioSet(organizationId: string, input: ScenarioSetInput) {
  const data = validate(input);
  await assertNameFree(organizationId, data.name);
  return prisma.scenarioSet.create({ data: { organizationId, ...data } });
}

export async function updateScenarioSet(organizationId: string, id: string, input: ScenarioSetInput) {
  const existing = await prisma.scenarioSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("Scenario set not found");
  const data = validate(input);
  await assertNameFree(organizationId, data.name, id);
  await prisma.scenarioSet.update({ where: { id }, data });
}

/**
 * Only an empty set can be deleted.
 *
 * Scenarios belong in sets now, so deleting one with members would either
 * delete work nobody asked to lose or leave scenarios outside any set — which
 * is exactly what sets-first is meant to stop. Move or delete them first. (The
 * relation is still SET NULL in the schema, so the database would allow it;
 * this is the rule, not the constraint.)
 */
export async function deleteScenarioSet(organizationId: string, id: string) {
  const existing = await prisma.scenarioSet.findFirst({
    where: { id, organizationId },
    select: { id: true, _count: { select: { scenarios: true } } },
  });
  if (!existing) throw new Error("Scenario set not found");
  const count = existing._count.scenarios;
  if (count > 0) {
    throw new Error(
      `This set still holds ${count} scenario${count === 1 ? "" : "s"}. Move ${count === 1 ? "it" : "them"} to another set or delete ${count === 1 ? "it" : "them"} first.`
    );
  }
  await prisma.scenarioSet.delete({ where: { id } });
}

/**
 * Put a scenario in a set, or move it from another.
 *
 * There is no taking one out: a scenario belongs to a set, and the way to
 * stop it belonging to this one is to put it in another. Moving needs no
 * ceremony because there is no second membership to lose, only a window to
 * change.
 */
export async function assignScenarioToSet(organizationId: string, scenarioId: string, setId: string) {
  const scenario = await prisma.scenario.findFirst({ where: { id: scenarioId, organizationId }, select: { id: true } });
  if (!scenario) throw new Error("Scenario not found");
  if (!setId) throw new Error("Choose a scenario set");
  await assertSetInOrganization(organizationId, setId);
  await prisma.scenario.update({ where: { id: scenarioId }, data: { scenarioSetId: setId } });
}

/** Ids arrive from forms; a set from another organization must not be joinable. */
export async function assertSetInOrganization(organizationId: string, setId: string | null) {
  if (!setId) return;
  const set = await prisma.scenarioSet.findFirst({ where: { id: setId, organizationId }, select: { id: true } });
  if (!set) throw new Error("Scenario set not found");
}
