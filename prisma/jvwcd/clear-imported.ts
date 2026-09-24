import { PrismaClient } from "@prisma/client";

/**
 * Remove what a previous run of this seed created, so it can be run again.
 *
 * Narrower than the reset script on purpose: that one empties every asset and
 * everything derived from it, which is the right tool once. This is for the
 * loop of running the importers, looking at the result and running them again,
 * and it only takes back what these importers write — the facility types in
 * full, and waterlines whose code marks them as an imported pipe band.
 *
 * A waterline that came from somewhere else keeps its place.
 */
export async function clearImportedAssets(prisma: PrismaClient, organizationId: string) {
  const facilityTypes = await prisma.assetType.findMany({
    where: { code: { in: ["RESERVOIR", "WELL", "BOOSTER_PUMP_STATION"] } },
    select: { id: true },
  });

  const assets = await prisma.asset.findMany({
    where: {
      organizationId,
      OR: [
        { assetTypeId: { in: facilityTypes.map((t) => t.id) } },
        { assetType: { code: "WATERLINE" }, assetCode: { startsWith: "PIPE-" } },
      ],
    },
    select: { id: true },
  });
  if (assets.length === 0) return 0;

  const ids = assets.map((a) => a.id);

  // Anything scored from these assets goes with them. A risk assessment for a
  // reservoir that no longer exists is not history, it is a dangling row —
  // and its factors hold the foreign key, so they go first.
  await prisma.riskFactor.deleteMany({ where: { riskAssessment: { assetId: { in: ids } } } });
  await prisma.riskAssessment.deleteMany({ where: { assetId: { in: ids } } });
  await prisma.deteriorationPrediction.deleteMany({ where: { assetId: { in: ids } } });
  await prisma.criticalityScore.deleteMany({ where: { assetId: { in: ids } } });
  await prisma.conditionMeasurement.deleteMany({ where: { assetId: { in: ids } } });

  await prisma.assetAttributeValue.deleteMany({ where: { assetId: { in: ids } } });
  await prisma.$executeRaw`DELETE FROM asset_locations WHERE "assetId" = ANY(${ids}::text[])`;
  await prisma.asset.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}
