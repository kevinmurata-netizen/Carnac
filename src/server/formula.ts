import { prisma } from "@/lib/prisma";
import { FormulaError, fieldsUsed, parse, type Node } from "@/domain/waterline/criticality-formula";
import { getFormulaFields } from "@/server/criticality";

/**
 * The checks any stored formula needs, whatever it computes.
 *
 * Criticality and Scale Factor share a language, a field vocabulary and an
 * evaluator; what differs is the range of the answer and what it is used for.
 * These live apart from both so the next formula-shaped setting does not
 * arrive by copying one of them.
 */

export async function assertAssetTypeInOrg(organizationId: string, assetTypeId: string) {
  const type = await prisma.assetType.findFirst({ where: { id: assetTypeId, organizationId } });
  if (!type) throw new Error("Asset type not found");
  return type;
}

export function validateFormulaName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Give the formula a name");
  if (trimmed.length > 60) throw new Error("Keep formula names under 60 characters");
  return trimmed;
}

/** Parses and checks every field exists, so an unusable formula is never
 * stored — a model run should not be where a typo first shows up. */
export async function validateExpression(assetTypeId: string, expression: string): Promise<Node> {
  let tree: Node;
  try {
    tree = parse(expression);
  } catch (e) {
    if (e instanceof FormulaError) throw new Error(`${e.message} (at character ${e.at + 1})`);
    throw e;
  }
  const fields = await getFormulaFields(assetTypeId);
  const known = new Set(fields.map((f) => f.code));
  const unknown = fieldsUsed(tree).filter((f) => !known.has(f));
  if (unknown.length > 0) {
    throw new Error(`No field called ${unknown.map((u) => `"${u}"`).join(", ")} on this asset type`);
  }
  return tree;
}
