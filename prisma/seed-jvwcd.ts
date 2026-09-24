import { prisma } from "@/lib/prisma";
import { ensureJvwcdAssetTypes, relaxWaterlineRequirements } from "./jvwcd/asset-types";

/**
 * Seed this instance with Jordan Valley Water Conservancy District's published
 * asset data.
 *
 * Source: JVWCD FY2025 Summary of Operations. Public summary tables, not
 * operational records: pipe is given by diameter band rather than by segment,
 * and facility coordinates are GRAMA-protected and absent.
 *
 * Run `npm run db:reset -- --yes` first. This adds; it does not clear.
 *
 * Phase 3 defines the asset types. The four importers — pipe inventory,
 * reservoirs, wells and booster pumps — arrive in Phase 4 and are called from
 * here, one per asset class.
 */
async function main() {
  const organization = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!organization) throw new Error("No organization — run the base seed first to create one.");

  console.log(`organization: ${organization.name}`);

  const types = await ensureJvwcdAssetTypes(prisma, organization.id);
  console.log("\nasset types:");
  for (const t of types) {
    console.log(`  ${t.created ? "created" : "updated"}  ${t.type} — ${t.attributes} attribute definitions`);
  }

  const relaxed = await relaxWaterlineRequirements(prisma);
  if (relaxed) console.log(`\nwaterline: ${relaxed} attribute no longer required (material is unknown in this dataset)`);

  // Phase 4:
  //   await importPipeInventory(prisma, organization.id);
  //   await importReservoirs(prisma, organization.id);
  //   await importWells(prisma, organization.id);
  //   await importBoosterPumps(prisma, organization.id);

  const counts = await prisma.assetType.findMany({
    select: { code: true, name: true, _count: { select: { assets: true, attributeDefinitions: true } } },
    orderBy: { code: "asc" },
  });
  console.log("\ncatalog now:");
  for (const t of counts) {
    console.log(`  ${t.code.padEnd(22)} ${String(t._count.attributeDefinitions).padStart(2)} attributes, ${t._count.assets} assets`);
  }

  await prisma.$disconnect();
}

main();
