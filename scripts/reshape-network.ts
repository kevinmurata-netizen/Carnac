/**
 * Re-lays the demo network's geometry over a street grid.
 *
 * The original seed placed each segment as an independent random line inside a
 * circle, which drew a scatter of disconnected sticks over farmland. This
 * rewrites where the pipes are so the map reads like a distribution system:
 * connected runs on streets, big mains forming a backbone, small ones on the
 * blocks.
 *
 * Geometry only. Inspections, condition history, risk, work plans, wishlist
 * items and users are untouched — this is safe to run against a database that
 * people have been using, which re-seeding would not be.
 *
 *   npm run db:reshape
 *
 * Point DATABASE_URL at whichever database you mean to change.
 */
import { config } from "dotenv";
config();

import { PrismaClient } from "@prisma/client";
import { buildNetworkLayout } from "../src/domain/waterline/network-layout";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("No organization found — seed the database first");

  // Biggest pipes first, so they land on the trunk edges the layout returns
  // first. Diameter driving position is what makes the result read correctly:
  // heavy mains through the middle of town, small ones out on the blocks.
  const assets = await prisma.asset.findMany({
    where: { organizationId: org.id, assetType: { code: "WATERLINE" }, deletedAt: null },
    select: {
      id: true,
      assetCode: true,
      attributeValues: { select: { id: true, numberValue: true, definition: { select: { code: true } } } },
    },
  });

  const diameterOf = (a: (typeof assets)[number]) =>
    a.attributeValues.find((v) => v.definition.code === "DIAMETER")?.numberValue ?? 0;

  const ordered = [...assets].sort((a, b) => diameterOf(b) - diameterOf(a) || a.assetCode.localeCompare(b.assetCode));
  const layout = buildNetworkLayout(ordered.length);

  if (layout.length < ordered.length) {
    throw new Error(`Layout produced ${layout.length} runs for ${ordered.length} segments — widen the grid`);
  }

  console.log(`Re-laying ${ordered.length} segments over the street grid…`);

  let moved = 0;
  let lengthsUpdated = 0;

  for (const [index, asset] of ordered.entries()) {
    const edge = layout[index];

    // Geometry is an Unsupported() PostGIS column, so it goes through raw SQL
    // like every other write to it.
    const updated = await prisma.$executeRaw`
      UPDATE asset_locations SET
        geometry = ST_SetSRID(ST_MakeLine(ST_MakePoint(${edge.startLng}, ${edge.startLat}), ST_MakePoint(${edge.endLng}, ${edge.endLat})), 4326),
        "startLat" = ${edge.startLat}, "startLng" = ${edge.startLng},
        "endLat" = ${edge.endLat}, "endLng" = ${edge.endLng},
        "serviceArea" = ${edge.serviceArea}, "pressureZone" = ${edge.pressureZone}
      WHERE "assetId" = ${asset.id}
    `;
    moved += updated;

    // The stored length has to agree with the line that is now drawn, or the
    // mileage on the dashboard describes a network that is not on the map.
    const lengthValue = asset.attributeValues.find((v) => v.definition.code === "LENGTH");
    if (lengthValue) {
      await prisma.assetAttributeValue.update({
        where: { id: lengthValue.id },
        data: { numberValue: edge.lengthFt },
      });
      lengthsUpdated++;
    }
  }

  const totalFt = layout.slice(0, ordered.length).reduce((sum, e) => sum + e.lengthFt, 0);
  console.log(`Moved ${moved} locations, updated ${lengthsUpdated} lengths.`);
  console.log(`Network is now ${(totalFt / 5280).toFixed(1)} miles across ${ordered.length} segments.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
