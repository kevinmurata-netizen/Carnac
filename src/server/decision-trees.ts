import { prisma } from "@/lib/prisma";
import {
  isValidTree,
  fromLegacyTree,
  countConditions,
  describeNode,
  type DecisionTree,
  type QualifyMode,
} from "@/domain/waterline/decision-tree";

/**
 * Decision trees are configuration, and these loaders are what the
 * recommendation engine actually reads — `isApplicable` calls `qualifies`
 * with whatever comes back from here. A tree saved on the Decision Trees page
 * gates real recommendations on the very next run; there is no separate copy
 * of this logic anywhere.
 *
 * Storage reuses `treatment_rules`: one row per tree, `ruleType` marking it.
 * The rows are a list already, so several trees per treatment needs no schema
 * change. The any/all mode rides in the treatment's `applicability` blob for
 * the same reason.
 */

export const TREE_RULE = "qualification-tree";
/** What the original binary decision trees were stored under. */
export const LEGACY_RULE = "decision-tree";

type RuleRow = { id: string; ruleType: string; condition: unknown };

/** Trees are stored as JSON, so they are validated on the way out rather than
 * trusted — a hand-edited row should not break the page or, worse, silently
 * change which assets qualify. */
export function parseTrees(rules: RuleRow[]): DecisionTree[] {
  const trees: DecisionTree[] = [];

  for (const rule of rules) {
    if (rule.ruleType !== TREE_RULE) continue;
    const tree = (rule.condition as { tree?: unknown } | null)?.tree;
    if (isValidTree(tree)) trees.push(tree);
  }

  // A treatment still carrying an unconverted binary tree keeps being gated by
  // it, read through the converter. Nothing is silently dropped just because
  // it predates the current format.
  if (trees.length === 0) {
    const legacy = rules.find((r) => r.ruleType === LEGACY_RULE);
    const converted = legacy
      ? fromLegacyTree((legacy.condition as { tree?: unknown } | null)?.tree, "Original rule")
      : null;
    if (converted) trees.push(converted);
  }

  return trees;
}

export function parseQualifyMode(applicability: unknown): QualifyMode {
  const mode = (applicability as { qualifyMode?: unknown } | null)?.qualifyMode;
  return mode === "all" ? "all" : "any";
}

export type TreatmentTrees = {
  treatmentId: string;
  treatmentName: string;
  qualifyMode: QualifyMode;
  trees: DecisionTree[];
};

export async function listTreatmentTrees(organizationId: string): Promise<TreatmentTrees[]> {
  const rows = await prisma.treatment.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: { rules: true },
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({
    treatmentId: row.id,
    treatmentName: row.name,
    qualifyMode: parseQualifyMode(row.applicability),
    trees: parseTrees(row.rules),
  }));
}

export type TreeSummary = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  conditionCount: number;
  summary: string;
};

export function summarize(tree: DecisionTree): TreeSummary {
  return {
    id: tree.id,
    name: tree.name,
    description: tree.description,
    enabled: tree.enabled,
    conditionCount: countConditions(tree.root),
    summary: describeNode(tree.root),
  };
}

async function requireTreatment(organizationId: string, treatmentId: string) {
  const treatment = await prisma.treatment.findFirst({
    where: { id: treatmentId, assetType: { code: "WATERLINE", organizationId } },
    include: { rules: true },
  });
  if (!treatment) throw new Error("That treatment no longer exists");
  return treatment;
}

/** Every tree row for a treatment, rewritten in one transaction. Saving the
 * set as a whole keeps the stored rules and the editor's view identical —
 * there is no partial state where a deleted tree still gates recommendations. */
export async function saveTrees(organizationId: string, treatmentId: string, trees: DecisionTree[]) {
  const treatment = await requireTreatment(organizationId, treatmentId);

  const names = new Set<string>();
  for (const tree of trees) {
    const label = (tree as { name?: unknown } | null)?.name;
    if (!isValidTree(tree)) {
      throw new Error(`"${typeof label === "string" && label.trim() ? label.trim() : "Untitled"}" is malformed and was not saved`);
    }
    const key = tree.name.trim().toLowerCase();
    if (names.has(key)) throw new Error(`Two trees are both named "${tree.name.trim()}"`);
    names.add(key);
  }

  const stale = treatment.rules.filter((r) => r.ruleType === TREE_RULE || r.ruleType === LEGACY_RULE);

  await prisma.$transaction([
    prisma.treatmentRule.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } }),
    ...trees.map((tree) =>
      prisma.treatmentRule.create({
        data: { treatmentId, ruleType: TREE_RULE, condition: { tree } as object },
      })
    ),
  ]);
}

export async function setQualifyMode(organizationId: string, treatmentId: string, mode: QualifyMode) {
  const treatment = await requireTreatment(organizationId, treatmentId);
  const applicability = (treatment.applicability ?? {}) as Record<string, unknown>;

  await prisma.treatment.update({
    where: { id: treatmentId },
    data: { applicability: { ...applicability, qualifyMode: mode } as object },
  });
}
