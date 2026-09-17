import { prisma } from "@/lib/prisma";
import { copyName, takenNames } from "@/lib/copy-name";
import {
  isValidNode,
  countConditions,
  describeNode,
  emptyGroup,
  isValidRuleNode,
  ruleIdsIn,
  ruleTreeFromFlat,
  type Group,
  type RuleGroup,
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
  /** Prices that apply only where this rule matches, as "Treatment: rate". */
  usedByRates: string[];
  /** Combinations this rule adds a gate to. */
  usedByCombinations: string[];
  /**
   * Why this rule cannot be deleted right now, or null when it can.
   *
   * Worked out once, here, so the list, the confirmation dialog and the
   * delete itself all refuse for the same reasons in the same words.
   */
  deleteBlocker: string | null;
};

/** Everything that points at a rule — each of which deleting it would break. */
const withUsage = {
  treatments: { include: { treatment: { select: { name: true } } } },
  costRates: { select: { name: true, treatment: { select: { name: true } } } },
  combinations: { select: { combination: { select: { name: true } } } },
} as const;

type RuleWithUsage = RuleRow & {
  treatments: Array<{ treatment: { name: string } }>;
  costRates: Array<{ name: string; treatment: { name: string } }>;
  combinations: Array<{ combination: { name: string } }>;
};

/**
 * What deleting this rule would break, in a sentence, or null.
 *
 * Three things point at a rule and each is refused for its own reason:
 *  - a **treatment** it gates would silently be considered more widely;
 *  - a **combination** it gates would silently be offered more widely — the
 *    same harm, which used to go unchecked because the link cascades;
 *  - a **price** that applies where it matches would lose the condition that
 *    picks it. The database refuses this one outright, and used to answer with
 *    a raw constraint error rather than a reason.
 */
function blockerFor(row: RuleWithUsage): string | null {
  const parts: string[] = [];
  const treatments = row.treatments.map((t) => t.treatment.name).sort();
  const combinations = row.combinations.map((c) => c.combination.name).sort();
  const rates = row.costRates.map((r) => `${r.treatment.name}: ${r.name}`).sort();
  if (treatments.length) parts.push(`gates ${treatments.join(", ")}`);
  if (combinations.length) parts.push(`gates the combination${combinations.length === 1 ? "" : "s"} ${combinations.join(", ")}`);
  if (rates.length) parts.push(`picks the price${rates.length === 1 ? "" : "s"} ${rates.join(", ")}`);
  return parts.length ? `still ${parts.join("; ")}` : null;
}

function toSummary(row: RuleWithUsage): RuleSummary {
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
    usedByRates: row.costRates.map((r) => `${r.treatment.name}: ${r.name}`).sort(),
    usedByCombinations: row.combinations.map((c) => c.combination.name).sort(),
    deleteBlocker: blockerFor(row),
  };
}

export async function listRules(organizationId: string): Promise<RuleSummary[]> {
  const rows = await prisma.rule.findMany({
    where: { organizationId },
    include: withUsage,
    orderBy: { name: "asc" },
  });
  return rows.map(toSummary);
}

export async function getRule(organizationId: string, id: string): Promise<RuleSummary | null> {
  const row = await prisma.rule.findFirst({
    where: { id, organizationId },
    include: withUsage,
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
 * Deleting a shared rule removes a gate from everything using it, so the
 * refusal names them. Detaching first is the deliberate, visible step —
 * exactly the shape `deleteTreatment` already uses for work plan items.
 */
export async function deleteRule(organizationId: string, id: string) {
  const row = await prisma.rule.findFirst({ where: { id, organizationId }, include: withUsage });
  if (!row) throw new Error("That rule no longer exists");

  const blocker = blockerFor(row);
  if (blocker) {
    throw new Error(
      `"${row.name}" ${blocker}. Detach it first — deleting it would silently change what those apply to.`
    );
  }

  await prisma.rule.delete({ where: { id } });
}

/**
 * Delete several rules at once: every one nothing depends on, keeping the
 * rest and saying why, by the same test as a single delete.
 */
export async function deleteRules(
  organizationId: string,
  ids: string[]
): Promise<{ deleted: string[]; kept: Array<{ name: string; reason: string }> }> {
  const rows = await prisma.rule.findMany({
    where: { id: { in: ids }, organizationId },
    include: withUsage,
  });

  const deletable = rows.filter((r) => blockerFor(r) == null);
  const kept = rows
    .filter((r) => blockerFor(r) != null)
    .map((r) => ({ name: r.name, reason: blockerFor(r)! }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (deletable.length > 0) {
    await prisma.rule.deleteMany({ where: { id: { in: deletable.map((r) => r.id) }, organizationId } });
  }
  return { deleted: deletable.map((r) => r.name).sort(), kept };
}

/**
 * Copy several rules. Each copy has the original's conditions, effect and
 * enabled state under a "(copy)" name, and is attached to nothing — so copying
 * changes no treatment, combination or price until a copy is put to use.
 */
export async function copyRules(organizationId: string, ids: string[]): Promise<string[]> {
  const [rows, all] = await Promise.all([
    prisma.rule.findMany({ where: { id: { in: ids }, organizationId }, orderBy: { name: "asc" } }),
    prisma.rule.findMany({ where: { organizationId }, select: { name: true } }),
  ]);
  const taken = takenNames(all);
  const copies = rows.map((r) => ({
    organizationId,
    name: copyName(r.name, taken),
    description: r.description,
    effect: r.effect,
    enabled: r.enabled,
    definition: r.definition as object,
  }));
  if (copies.length > 0) await prisma.rule.createMany({ data: copies });
  return copies.map((c) => c.name);
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
  attached: RuleSummary[];
  /** How the allow rules are arranged. Synthesised from the flat list when
   * nothing is stored, so the editor always has a tree to show. */
  tree: RuleGroup;
  /** Blocks are absolute and sit outside the tree, so they are listed apart. */
  blocks: RuleSummary[];
};

export async function getTreatmentRules(
  organizationId: string,
  treatmentId: string
): Promise<TreatmentRuleSelection | null> {
  const treatment = await prisma.treatment.findFirst({
    where: { id: treatmentId, assetType: { code: "WATERLINE", organizationId } },
    include: {
      ruleLinks: {
        include: { rule: { include: withUsage } },
      },
    },
  });
  if (!treatment) return null;

  const attached = treatment.ruleLinks
    .map((l) => toSummary(l.rule))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Every stored treatment carries a tree — the Phase 5 migration backfilled
  // them and both writers set one — so the flat reading is a floor for a row
  // written by something older, not a path real data takes. It assumes "all",
  // which is what a converted condition window always meant.
  const stored = treatment.ruleTree;
  const tree =
    isValidRuleNode(stored) && (stored as RuleGroup).kind === "group"
      ? (stored as RuleGroup)
      : ruleTreeFromFlat(parseRules(treatment.ruleLinks.map((l) => l.rule)), "all");

  return {
    treatmentId: treatment.id,
    treatmentName: treatment.name,
    attached,
    tree,
    blocks: attached.filter((r) => r.effect === "block"),
  };
}

/**
 * Replace the whole set of rules attached to a treatment, in one transaction.
 * Saving the set as a whole keeps the stored links and the editor's view
 * identical: there is no partial state where a detached rule still gates
 * recommendations.
 */
/**
 * Save the arrangement of allow rules, plus whichever blocks are attached.
 *
 * The tree is the source of truth for which allow rules gate the treatment;
 * the links are rewritten from it so "Used by" on the rules page cannot drift
 * from what actually applies. Blocks are passed separately because they are
 * not in the tree.
 */
export async function setTreatmentRuleTree(
  organizationId: string,
  treatmentId: string,
  tree: RuleGroup,
  blockRuleIds: string[]
) {
  const treatment = await prisma.treatment.findFirst({
    where: { id: treatmentId, assetType: { code: "WATERLINE", organizationId } },
    select: { id: true },
  });
  if (!treatment) throw new Error("That treatment no longer exists");
  if (!isValidRuleNode(tree) || tree.kind !== "group") throw new Error("That arrangement is malformed and was not saved");

  const referenced = ruleIdsIn(tree);
  const all = [...new Set([...referenced, ...blockRuleIds])];

  // Checked against this organization rather than trusted, so a crafted
  // request cannot gate on another tenant's rule.
  const valid = await prisma.rule.findMany({
    where: { id: { in: all }, organizationId },
    select: { id: true, effect: true },
  });
  if (valid.length !== all.length) throw new Error("One of those rules no longer exists");

  const blocksInTree = valid.filter((r) => r.effect === "block" && referenced.includes(r.id));
  if (blocksInTree.length > 0) {
    throw new Error(
      "A blocking rule cannot go inside the arrangement. Blocks always apply, so putting one inside an \"any of\" group would have no clear meaning."
    );
  }

  await prisma.$transaction([
    prisma.treatmentRuleLink.deleteMany({ where: { treatmentId } }),
    ...(all.length > 0
      ? [prisma.treatmentRuleLink.createMany({ data: all.map((ruleId) => ({ treatmentId, ruleId })) })]
      : []),
    prisma.treatment.update({ where: { id: treatmentId }, data: { ruleTree: tree as object } }),
  ]);
}
