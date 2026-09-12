import { prisma } from "@/lib/prisma";
import { parseRules } from "@/server/rules";
import type { CombinationDef } from "@/domain/waterline/treatment";

/**
 * Treatment combinations: which treatments an organization is willing to apply
 * together on one asset in one year.
 *
 * Predefining them is what keeps the model from searching every subset of the
 * library — options per asset stay linear in (treatments + combinations)
 * rather than exponential. See docs/TREATMENT-MODEL-REBUILD.md §4 Phase 4.
 */

const withEverything = {
  members: { include: { treatment: { select: { id: true, name: true } } } },
  rules: { include: { rule: true } },
} as const;

/** What the engine reads. Member treatments are resolved to names here so the
 * domain layer never handles database identifiers. */
export async function loadCombinations(organizationId: string): Promise<CombinationDef[]> {
  const rows = await prisma.treatmentCombination.findMany({
    where: { organizationId },
    include: withEverything,
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    enabled: row.enabled,
    members: row.members.map((m) => ({ treatment: m.treatment.name, required: m.required })),
    rules: parseRules(row.rules.map((r) => r.rule)),
    qualifyMode: row.qualifyMode === "any" ? "any" : "all",
    mobilizationCost: row.mobilizationCost,
  }));
}

export type CombinationSummary = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  qualifyMode: "any" | "all";
  /** Null means the engine keeps inferring it from the members' rates. */
  mobilizationCost: number | null;
  members: Array<{ treatmentId: string; treatmentName: string; required: boolean }>;
  ruleIds: string[];
  ruleNames: string[];
  /** Members that each reset condition. Two of them is almost always an
   * authoring error, so the page says so rather than silently costing both. */
  conflictingResets: string[];
};

function toSummary(
  row: Awaited<ReturnType<typeof fetchOne>> & object,
  resetByTreatmentId: Map<string, boolean>
): CombinationSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    qualifyMode: row.qualifyMode === "any" ? "any" : "all",
    mobilizationCost: row.mobilizationCost,
    members: row.members.map((m) => ({
      treatmentId: m.treatment.id,
      treatmentName: m.treatment.name,
      required: m.required,
    })),
    ruleIds: row.rules.map((r) => r.ruleId),
    ruleNames: row.rules.map((r) => r.rule.name).sort(),
    conflictingResets: row.members
      .filter((m) => resetByTreatmentId.get(m.treatment.id))
      .map((m) => m.treatment.name)
      .sort(),
  };
}

function fetchOne(organizationId: string, id: string) {
  return prisma.treatmentCombination.findFirst({
    where: { id, organizationId },
    include: withEverything,
  });
}

/** Which treatments reset condition rather than nudging it. Read from the
 * applicability blob, the same place toDef() reads it. */
async function resetFlags(organizationId: string): Promise<Map<string, boolean>> {
  const rows = await prisma.treatment.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    select: { id: true, applicability: true },
  });
  return new Map(
    rows.map((r) => [r.id, (r.applicability as { conditionResetTo?: number | null } | null)?.conditionResetTo != null])
  );
}

export async function listCombinations(organizationId: string): Promise<CombinationSummary[]> {
  const [rows, resets] = await Promise.all([
    prisma.treatmentCombination.findMany({
      where: { organizationId },
      include: withEverything,
      orderBy: { name: "asc" },
    }),
    resetFlags(organizationId),
  ]);
  return rows.map((row) => toSummary(row, resets));
}

export async function getCombination(organizationId: string, id: string): Promise<CombinationSummary | null> {
  const [row, resets] = await Promise.all([fetchOne(organizationId, id), resetFlags(organizationId)]);
  return row ? toSummary(row, resets) : null;
}

export type CombinationInput = {
  name: string;
  description: string | null;
  enabled: boolean;
  qualifyMode: "any" | "all";
  /** Null keeps the inferred figure — the largest of the members' rates. */
  mobilizationCost: number | null;
  members: Array<{ treatmentId: string; required: boolean }>;
  ruleIds: string[];
};

function validate(input: CombinationInput) {
  if (!input.name.trim()) throw new Error("Give the combination a name");

  if (input.mobilizationCost != null) {
    if (!Number.isFinite(input.mobilizationCost) || input.mobilizationCost < 0) {
      throw new Error("Mobilization must be zero or more. Leave it empty to keep the inferred figure.");
    }
  }

  const ids = input.members.map((m) => m.treatmentId);
  if (new Set(ids).size !== ids.length) throw new Error("A treatment can only appear once in a combination");
  if (input.members.length < 2) {
    throw new Error(
      "A combination needs at least two treatments. One on its own is already offered — every treatment always is."
    );
  }
  if (!input.members.some((m) => m.required)) {
    throw new Error(
      "At least one member must be required. With every member optional the combination could shrink to nothing."
    );
  }
}

async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.treatmentCombination.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new Error(`A combination named "${clash.name}" already exists`);
}

async function assertOwned(organizationId: string, input: CombinationInput) {
  // Checked rather than trusted, so a crafted request cannot bundle another
  // tenant's treatments or gate on their rules.
  const treatments = await prisma.treatment.findMany({
    where: { id: { in: input.members.map((m) => m.treatmentId) }, assetType: { code: "WATERLINE", organizationId } },
    select: { id: true },
  });
  if (treatments.length !== input.members.length) throw new Error("One of those treatments no longer exists");

  if (input.ruleIds.length > 0) {
    const rules = await prisma.rule.findMany({
      where: { id: { in: input.ruleIds }, organizationId },
      select: { id: true },
    });
    if (rules.length !== input.ruleIds.length) throw new Error("One of those rules no longer exists");
  }
}

export async function createCombination(organizationId: string, input: CombinationInput): Promise<string> {
  validate(input);
  const name = input.name.trim();
  await assertNameFree(organizationId, name);
  await assertOwned(organizationId, input);

  const created = await prisma.treatmentCombination.create({
    data: {
      organizationId,
      name,
      description: input.description?.trim() || null,
      enabled: input.enabled,
      qualifyMode: input.qualifyMode,
      mobilizationCost: input.mobilizationCost,
      members: { create: input.members.map((m) => ({ treatmentId: m.treatmentId, required: m.required })) },
      rules: { create: input.ruleIds.map((ruleId) => ({ ruleId })) },
    },
    select: { id: true },
  });
  return created.id;
}

/** Members and rules are replaced wholesale rather than diffed, so there is no
 * partial state where a detached member still forms part of a priced bundle. */
export async function updateCombination(organizationId: string, id: string, input: CombinationInput) {
  validate(input);
  const name = input.name.trim();
  const existing = await fetchOne(organizationId, id);
  if (!existing) throw new Error("That combination no longer exists");
  await assertNameFree(organizationId, name, id);
  await assertOwned(organizationId, input);

  await prisma.$transaction([
    prisma.combinationMember.deleteMany({ where: { combinationId: id } }),
    prisma.combinationRuleLink.deleteMany({ where: { combinationId: id } }),
    prisma.treatmentCombination.update({
      where: { id },
      data: {
        name,
        description: input.description?.trim() || null,
        enabled: input.enabled,
        qualifyMode: input.qualifyMode,
        mobilizationCost: input.mobilizationCost,
        members: { create: input.members.map((m) => ({ treatmentId: m.treatmentId, required: m.required })) },
        rules: { create: input.ruleIds.map((ruleId) => ({ ruleId })) },
      },
    }),
  ]);
}

/**
 * Deleting a combination is safe in a way deleting a rule is not: it removes a
 * way to spend money without changing what any individual treatment is
 * considered for. Work plans already generated keep their rows — they record
 * what was decided, not what the library currently offers.
 */
export async function deleteCombination(organizationId: string, id: string) {
  const row = await fetchOne(organizationId, id);
  if (!row) throw new Error("That combination no longer exists");
  await prisma.treatmentCombination.delete({ where: { id } });
}
