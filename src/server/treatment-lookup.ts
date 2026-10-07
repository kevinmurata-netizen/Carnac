import { prisma } from "@/lib/prisma";
import { modelledType } from "@/server/modelled-asset-type";

/**
 * Treatment ids by name, within an asset's own type.
 *
 * A run's projects name their treatments; a plan row needs the treatment's
 * id. Names are unique within an asset type, not across types — two asset
 * classes can each have a "Replacement" — so the lookup goes through the
 * asset the work is on. Only this organization's modelled types are read: a
 * name never resolves to another organization's treatment.
 */
export async function treatmentIdsForAssets(organizationId: string, assetIds: string[]) {
  const [treatments, assets] = await Promise.all([
    prisma.treatment.findMany({
      where: { assetType: modelledType(organizationId) },
      select: { id: true, name: true, assetTypeId: true },
    }),
    prisma.asset.findMany({
      where: { organizationId, id: { in: [...new Set(assetIds)] } },
      select: { id: true, assetTypeId: true },
    }),
  ]);
  const byKey = new Map(treatments.map((t) => [treatmentKey(t.assetTypeId, t.name), t.id]));
  const typeOf = new Map(assets.map((a) => [a.id, a.assetTypeId]));
  return (assetId: string, treatmentName: string): string | undefined => {
    const assetTypeId = typeOf.get(assetId);
    return assetTypeId ? byKey.get(treatmentKey(assetTypeId, treatmentName)) : undefined;
  };
}

/** A treatment's identity: its asset type and its name. */
export function treatmentKey(assetTypeId: string | null | undefined, name: string) {
  return `${assetTypeId ?? ""}\u0000${name}`;
}
