import { PrismaClient } from "@prisma/client";
import { num, readCsv, text, yearAsDate } from "./csv";
import { assetTypeByCode, definitionsFor, writeAsset } from "./write-asset";

/**
 * JVWCD's finished-water storage: 31 tanks.
 *
 * Unlike the pipe table this is a row per asset, and it carries what makes a
 * condition model worth running — a build year spread across seven decades and
 * an inspection year that is missing on some tanks and years old on others.
 *
 * The build year goes to `Asset.installationDate`, which is the field the age
 * and deterioration models read; storing it only as an attribute would leave
 * every tank ageless. The inspection year stays an attribute, because it is a
 * year rather than an inspection record and the inspection templates in this
 * app belong to the waterline type.
 *
 * Several addresses appear more than once — a site with two or three tanks on
 * it — so the asset code is sequential and the address is what they share.
 */
export async function importReservoirs(prisma: PrismaClient, organizationId: string) {
  const assetTypeId = await assetTypeByCode(prisma, "RESERVOIR");
  const definitions = await definitionsFor(prisma, assetTypeId);
  const rows = readCsv("jvwcd_reservoirs.csv");

  let created = 0;
  let totalCapacityMg = 0;
  let withoutInspection = 0;
  const warnings: string[] = [];

  for (const [index, row] of rows.entries()) {
    const address = text(row.site_address);
    const capacity = num(row.capacity_mg);
    const built = yearAsDate(row.year_built);
    // The District publishes an inspection year, not a date. Stored as 1
    // January of that year, which is what the attribute's note says, so
    // "years since" arithmetic works without inventing a month.
    const inspected = yearAsDate(row.last_inspected);
    if (!address) {
      warnings.push(`row ${index + 2} has no site address and was skipped`);
      continue;
    }
    if (built == null) warnings.push(`${address}: no build year, so it has no age`);
    if (inspected == null) withoutInspection++;

    const assetCode = `RES-${String(index + 1).padStart(4, "0")}`;
    await writeAsset(prisma, {
      organizationId,
      assetTypeId,
      definitions,
      input: {
        assetCode,
        name: `${address}${capacity != null ? ` — ${capacity} MG` : ""}`,
        installationDate: built,
        attributes: {
          FACILITY_ID: assetCode,
          ADDRESS: address,
          CAPACITY_MG: capacity,
          MATERIAL: text(row.material),
          LAST_INSPECTED: inspected,
          FLOOR_ELEV_FT: num(row.floor_elev_ft),
          OVERFLOW_ELEV_FT: num(row.overflow_elev_ft),
        },
      },
    });
    created++;
    totalCapacityMg += capacity ?? 0;
  }

  return { created, totalCapacityMg: Math.round(totalCapacityMg * 100) / 100, withoutInspection, warnings };
}
