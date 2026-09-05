import { prisma } from "@/lib/prisma";
import {
  isValidNode,
  countConditions,
  describeNode,
  emptyGroup,
  type Group,
  type Rule,
  type RuleEffect,
} from "@/domain/waterline/decision-tree";

/**
 * Treatment rules are configuration, and these loaders are what the
 * recommendation engine actually reads — `isApplicable` evaluates whatever
 * comes back from here. A rule saved on the Treatment Rules page gates real
 * recommendations on the very next run; there is no second copy of this logic
 * anywhere.
 *
 * A rule belongs to the organization, not to a treatment: "Condition 0-30" is
 * written once and attached wherever it applies. See
 * docs/TREATMENT-MODEL-REBUILD.md.
 */

type RuleRow = {
  id: string;
  name: string;
  description: string | null;
  effect: string;
  enabled: boolean;
  definition: unknown;
  isGenerated: boolean;
};

/** Definitions are JSON, so they are validated on the way out rather than
 * trusted. A hand-edited row should not break the page or, far worse, silently
 * change which assets qualify. A row that fails validation is dropped and its
 * treatment is left ungated by it, which is visible on the page. */
export function parseRules(rows: RuleRow[]): Rule[] {
  const rules: Rule[] = [];
  for (const row of rows) {
    if (!isValidNode(row.definition) || (row.definition as Group).kind !== "group") continue;
    rules.push({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      enabled: row.enabled,
      effect: row.effect === "block" ? "block" : "allow",
      isGenerated: row.isGenerated,
      root: row.definition as Group,
    });
  }
  return rules;
}

export type RuleSummary = {
  id: string;
  name: string;
  description: string | null;
  effect: RuleEffect;
  enabled: boolean;
  isGenerated: boolean;
  conditionCount: number;
  /** The rule in one sentence, e.g. "Condition (WCI) is between 0 and 45". */
  summary: string;
  /** Treatment names this rule is attached to, alphabetically. */
  usedBy: string[];
};

function toSummary(row: RuleRow & { treatments: Array<{ treatment: { name: string } }> }): RuleSummary {
  const parsed = parseRules([row])[0];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    effect: row.effect === "block" ? "block" : "allow",
    enabled: row.enabled,
    isGenerated: row.isGenerated,
    conditionCount: parsed ? countConditions(parsed.root) : 0,
    summary: parsed ? describeNode(parsed.root) : "This rule could not be read and is being ignored.",
    usedBy: row.treatments.map((t) => t.treatment.name).sort(),
  };
}

export async function listRules(organizationId: string): Promise<RuleSummary[]> {
  const rows = await prisma.rule.findMany({
    where: { organizationId },
    include: { treatments: { include: { treatment: { select: { name: true } } } } },
    orderBy: { name: "asc" },
  });
  return rows.map(toSummary);
}

export async function getRule(organizationId: string, id: string): Promise<RuleSummary | null> {
  const row = await prisma.rule.findFirst({
    where: { id, organizationId },
    include: { treatments: { include: { treatment: { select: { name: true } } } } },
  });
  return row ? toSummary(row) : null;
}

/** The rule itself, in the shape the builder edits. */
export async function getRuleForEditing(organizationId: string, id: string): Promise<Rule | null> {
  const row = await prisma.rule.findFirst({ where: { id, organizationId } });
  return row ? (parseRules([row])[0] ?? null) : null;
}

export type RuleInput = {
  name: string;
  description: string | null;
  effect: RuleEffect;
  enabled: boolean;
  root: Group;
};

/** Case-insensitive, because "Condition 0-30" and "condition 0-30" are the
 * same rule to everyone except a unique index. */
async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.rule.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new Error(`A rule named "${clash.name}" already exists`);
}

function validate(input: RuleInput) {
  if (!input.name.trim()) throw new Error("Give the rule a name");
  if (!isValidNode(input.root) || input.root.kind !== "group") throw new Error("That rule is malformed and was not saved");
}

export async function createRule(organizationId: string, input: RuleInput): Promise<string> {
  validate(input);
  const name = input.name.trim();
  await assertNameFree(organizationId, name);

  const created = await prisma.rule.create({
    data: {
      organizationId,
      name,
      description: input.description?.trim() || null,
      effect: input.effect,
      enabled: input.enabled,
      definition: input.root as object,
    },
    select: { id: true },
  });
  return created.id;
}

export async function updateRule(organizationId: string, id: string, input: RuleInput) {
  validate(input);
  const name = input.name.trim();
  const existing = await prisma.rule.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("That rule no longer exists");
  await assertNameFree(organizationId, name, id);

  await prisma.rule.update({
    where: { id },
    data: {
      name,
      description: input.description?.trim() || null,
      effect: input.effect,
      enabled: input.enabled,
      definition: input.root as object,
      // A rule someone has edited is theirs, not the migration's, and should
      // stop being described as generated.
      isGenerated: false,
    },
  });
}

/**
 * Deleting a shared rule removes a gate from every treatment using it, so the
 * refusal names them. Detaching first is the deliberate, visible step —
 * exactly the shape `deleteTreatment` already uses for work plan items.
 */
export async function deleteRule(organizationId: string, id: string) {
  const row = await prisma.rule.findFirst({
    where: { id, organizationId },
    include: { treatments: { include: { treatment: { select: { name: true } } } } },
  });
  if (!row) throw new Error("That rule no longer exists");

  if (row.treatments.length > 0) {
    const names = row.treatments.map((t) => t.treatment.name).sort().join(", ");
    throw new Error(
      `"${row.name}" still gates ${names}. Detach it from those treatments first — deleting it would silently widen what they are considered for.`
    );
  }

  await prisma.rule.delete({ where: { id } });
}

export function newRuleDraft(): RuleInput {
  return { name: "", description: null, effect: "allow", enabled: true, root: emptyGroup("AND") };
}

// ---------------------------------------------------------------------------
// Attaching rules to treatments
// ---------------------------------------------------------------------------

export type TreatmentRuleSelection = {
  treatmentId: string;
  treatmentName: string;
  qualifyMode: "any" | "all";
  attached: RuleSummary[];
};

export async function getTreatmentRules(
  organizationId: string,
  treatmentId: string
): Promise<TreatmentRuleSelection | null> {
  const treatment = await prisma.treatment.findFirst({
    where: { id: treatmentId, assetType: { code: "WATERLINE", organizationId } },
    include: {
      ruleLinks: {
        include: { rule: { include: { treatments: { include: { treatment: { select: { name: true } } } } } } },
      },
    },
  });
  if (!treatment) return null;

  return {
    treatmentId: treatment.id,
    treatmentName: treatment.name,
    qualifyMode: treatment.qualifyMode === "any" ? "any" : "all",
    attached: treatment.ruleLinks.map((l) => toSummary(l.rule)).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Replace the whole set of rules attached to a treatment, in one transaction.
 * Saving the set as a whole keeps the stored links and the editor's view
 * identical: there is no partial state where a detached rule still gates
 * recommendations.
 */
export async function setTreatmentRules(
  organizationId: string,
  treatmentId: string,
  ruleIds: string[],
  qualifyMode: "any" | "all"
) {
  const treatment = await prisma.treatment.findFirst({
    where: { id: treatmentId, assetType: { code: "WATERLINE", organizationId } },
    select: { id: true },
  });
  if (!treatment) throw new Error("That treatment no longer exists");

  const unique = [...new Set(ruleIds)];
  // Checked against this organization's rules rather than trusted, so a
  // crafted request cannot attach another tenant's rule.
  const valid = await prisma.rule.findMany({
    where: { id: { in: unique }, organizationId },
    select: { id: true },
  });
  if (valid.length !== unique.length) throw new Error("One of those rules no longer exists");

  await prisma.$transaction([
    prisma.treatmentRuleLink.deleteMany({ where: { treatmentId } }),
    ...(unique.length > 0
      ? [prisma.treatmentRuleLink.createMany({ data: unique.map((ruleId) => ({ treatmentId, ruleId })) })]
      : []),
    prisma.treatment.update({ where: { id: treatmentId }, data: { qualifyMode } }),
  ]);
}
