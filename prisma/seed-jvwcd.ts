import { prisma } from "@/lib/prisma";
import { ensureJvwcdAssetTypes, relaxWaterlineRequirements } from "./jvwcd/asset-types";
import { importPipeInventory } from "./jvwcd/import-pipe-inventory";
import { importReservoirs } from "./jvwcd/import-reservoirs";
import { importWells } from "./jvwcd/import-wells";
import { importBoosterPumps } from "./jvwcd/import-booster-pumps";
import { clearImportedAssets } from "./jvwcd/clear-imported";
import { importFacilityLocations, importPipeLocations } from "./jvwcd/import-locations";
import { recomputeReservoirRisk } from "@/server/reservoir-risk";

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
const ORGANIZATION_NAME = "Jordan Valley Water Conservancy District";

async function main() {
  const organization = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!organization) throw new Error("No organization — run the base seed first to create one.");

  // The sample seed names the utility Meridian Falls, which is invented and
  // shows in the app header and on every screen. A demo seeded with the
  // District's own data should say whose data it is.
  if (organization.name !== ORGANIZATION_NAME) {
    await prisma.organization.update({ where: { id: organization.id }, data: { name: ORGANIZATION_NAME } });
    console.log(`organization: renamed "${organization.name}" to "${ORGANIZATION_NAME}"`);
  } else {
    console.log(`organization: ${organization.name}`);
  }

  const types = await ensureJvwcdAssetTypes(prisma, organization.id);
  console.log("\nasset types:");
  for (const t of types) {
    console.log(`  ${t.created ? "created" : "updated"}  ${t.type} — ${t.attributes} attribute definitions`);
  }

  const waterline = await relaxWaterlineRequirements(prisma);
  console.log(
    `\nwaterline: ${waterline.relaxed} attribute no longer required (material is unknown in this dataset), ${waterline.added} band attributes available`
  );

  // Runnable again: whatever an earlier run of these importers left is taken
  // back first, so a fix can be tried without emptying the whole database.
  const cleared = await clearImportedAssets(prisma, organization.id);
  if (cleared > 0) console.log(`\ncleared ${cleared} assets from an earlier run of this seed`);

  const pipes = await importPipeInventory(prisma, organization.id);
  console.log(
    `\npipe inventory: ${pipes.bands} bands -> ${pipes.assets} assets, ${pipes.totalFeet.toLocaleString("en-US")} LF (${Math.round((pipes.totalFeet / 5280) * 10) / 10} mi)${pipes.synthesized ? ", synthesized into segments" : ", as published"}`
  );

  const reservoirs = await importReservoirs(prisma, organization.id);
  console.log(
    `reservoirs: ${reservoirs.created} tanks, ${reservoirs.totalCapacityMg} MG total, ${reservoirs.withoutInspection} with no inspection year`
  );

  const wells = await importWells(prisma, organization.id);
  console.log(
    `wells: ${wells.created} wells, ${wells.totalProductionAf.toLocaleString("en-US")} AF produced in the latest year, ${wells.idle} that produced nothing`
  );

  const pumps = await importBoosterPumps(prisma, organization.id);
  console.log(
    `booster pumps: ${pumps.created} stations, ${pumps.totalHp.toLocaleString("en-US")} hp, ${pumps.totalVolumeAf.toLocaleString("en-US")} AF pumped`
  );

  // Geometry. Pipes are always illustrative — the inventory has no alignments.
  // Facilities are geocoded from their published addresses, which needs a key;
  // without one they are left with no location at all rather than quietly
  // scattered across the valley.
  const lines = await importPipeLocations(prisma);
  console.log(
    `\npipe geometry: ${lines.drawn} bands drawn as ${lines.strandCount.toLocaleString("en-US")} runs along the valley's corridors (illustrative — not real alignments)`
  );

  // Utah's own geocoder where a usable key exists, since it is better at Salt
  // Lake grid addresses; otherwise the Census Bureau's, which needs no account.
  // GEOCODER=census forces the second even when a key is present.
  const apiKey = process.env.AGRC_API_KEY;
  const provider = process.env.GEOCODER === "census" || !apiKey ? "census" : "agrc";
  const located = await importFacilityLocations(prisma, { provider, apiKey });
  console.log(
    `facility geometry (${provider === "agrc" ? "Utah AGRC" : "US Census"}): ${located.geocoded} geocoded, ${located.scattered} scattered and flagged — ${located.total} distinct addresses, ${located.queried} newly queried`
  );
  if (located.misses.length > 0) {
    console.log(`  did not match: ${located.misses.slice(0, 8).join(" · ")}${located.misses.length > 8 ? " …" : ""}`);
  }

  // Reservoirs are the one class here with enough published data to score:
  // a build year spanning seventy years and an inspection year that is
  // sometimes a decade old.
  const scored = await recomputeReservoirRisk(organization.id);
  if (scored.length > 0) {
    const worst = [...scored].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);
    console.log(`\nreservoir risk: ${scored.length} scored. Highest risk:`);
    for (const r of worst) {
      console.log(
        `  ${r.assetCode}  risk ${r.riskScore.toFixed(1)} (pof ${r.pof} x cof ${r.cof})  ${r.material ?? "unknown"}, ${r.ageYears ?? "?"} yr, ${r.capacityMg ?? "?"} MG, inspected ${r.yearsSinceInspection == null ? "never" : `${r.yearsSinceInspection} yr ago`}`
      );
    }
  }

  const warnings = [
    ...pipes.warnings.map((w) => `pipes: ${w}`),
    ...reservoirs.warnings.map((w) => `reservoirs: ${w}`),
    ...wells.warnings.map((w) => `wells: ${w}`),
    ...pumps.warnings.map((w) => `pumps: ${w}`),
  ];
  if (warnings.length > 0) {
    console.log(`\nwhat the source does not say (${warnings.length}):`);
    for (const w of warnings.slice(0, 12)) console.log(`  ${w}`);
    if (warnings.length > 12) console.log(`  … and ${warnings.length - 12} more`);
  }

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
