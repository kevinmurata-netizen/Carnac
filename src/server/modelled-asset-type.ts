import { prisma } from "@/lib/prisma";

/**
 * Which asset type the engine models: the one whose assets scenarios run
 * over, treatment planning ranks, and whose treatments, rules, condition,
 * risk and deterioration models the settings pages edit.
 *
 * Chosen by a flag on the asset type rather than by its code, so no code
 * names an asset class. Until the engine can model several asset types side
 * by side — each with its own library — an organization models exactly one,
 * and `findModelledAssetType` refuses a second rather than letting the engine
 * run one asset class through another's arithmetic.
 */

/** An asset type filter: the modelled type in this organization. */
export function modelledType(organizationId: string) {
  return { organizationId, isModelled: true } as const;
}

/** The same, for a relation filter where the organization is already fixed
 * on the parent row (an asset's own organizationId, say). */
export const MODELLED = { isModelled: true } as const;

export type ModelledAssetType = { id: string; code: string; name: string };

/** Every asset type this organization models, for what is loaded per type:
 * curves, size and criticality formulas. */
export async function listModelledAssetTypes(organizationId: string): Promise<ModelledAssetType[]> {
  return prisma.assetType.findMany({
    where: modelledType(organizationId),
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Which modelled asset type a settings screen is showing: the one asked for
 * (`?type=<id>`), or else the one with the most assets — the main network, so
 * modelling a second, smaller type doesn't move the screen off the library
 * everyone was working in. `types` is every modelled type, by name, for the
 * tabs that switch between them.
 */
export async function chooseModelledAssetType(
  organizationId: string,
  requestedId?: string | null
): Promise<{ types: ModelledAssetType[]; selected: ModelledAssetType | null }> {
  const rows = await prisma.assetType.findMany({
    where: modelledType(organizationId),
    select: { id: true, code: true, name: true, _count: { select: { assets: true } } },
    orderBy: { name: "asc" },
  });
  const types = rows.map(({ id, code, name }) => ({ id, code, name }));
  const largest = [...rows].sort((a, b) => b._count.assets - a._count.assets)[0];
  const selected = types.find((t) => t.id === requestedId) ?? types.find((t) => t.id === largest?.id) ?? null;
  return { types, selected };
}

/** A modelled asset type by id, checked to be this organization's — for the
 * create paths, whose type arrives from a form. */
export async function requireModelledAssetTypeById(organizationId: string, id: string): Promise<ModelledAssetType> {
  const type = await prisma.assetType.findFirst({
    where: { id, ...modelledType(organizationId) },
    select: { id: true, code: true, name: true },
  });
  if (!type) throw new Error("That asset type isn't one this organization models.");
  return type;
}

/** The organization's modelled asset type, or null when it has none. */
export async function findModelledAssetType(organizationId: string): Promise<ModelledAssetType | null> {
  const types = await prisma.assetType.findMany({
    where: modelledType(organizationId),
    select: { id: true, code: true, name: true },
    take: 2,
  });
  if (types.length > 1) {
    throw new Error(
      `${types.map((t) => t.name).join(" and ")} are both set to be modelled. Modelling more than one asset type at once isn't supported yet.`
    );
  }
  return types[0] ?? null;
}

/** The same, for callers that cannot do anything without one. */
export async function requireModelledAssetType(organizationId: string): Promise<ModelledAssetType> {
  const type = await findModelledAssetType(organizationId);
  if (!type) throw new Error("No asset type is set to be modelled for this organization.");
  return type;
}
