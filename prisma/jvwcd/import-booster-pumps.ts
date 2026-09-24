import { PrismaClient } from "@prisma/client";
import { num, readCsv, text } from "./csv";
import { assetTypeByCode, definitionsFor, writeAsset } from "./write-asset";

/**
 * JVWCD's booster pump stations: 13, each lifting water into a named zone.
 *
 * The zone is what distinguishes them operationally — two stations at the same
 * capacity serving different zones are different problems — so it leads the
 * name as well as being an attribute.
 *
 * Some stations have no average dynamic lift published, and one pumped a single
 * acre-foot all year while another pumped nothing on a $1,574 power bill. Both
 * are left as the District reported them.
 */
export async function importBoosterPumps(prisma: PrismaClient, organizationId: string) {
  const assetTypeId = await assetTypeByCode(prisma, "BOOSTER_PUMP_STATION");
  const definitions = await definitionsFor(prisma, assetTypeId);
  const rows = readCsv("jvwcd_booster_pumps.csv");

  let created = 0;
  let totalHp = 0;
  let totalVolumeAf = 0;
  const warnings: string[] = [];

  for (const [index, row] of rows.entries()) {
    const location = text(row.location);
    const zone = text(row.zone);
    if (!location && !zone) {
      warnings.push(`row ${index + 2} has neither zone nor location and was skipped`);
      continue;
    }
    if (num(row.avg_dynamic_lift_ft) == null) warnings.push(`${zone ?? location}: no average dynamic lift published`);

    const hp = num(row.total_hp);
    const volume = num(row.fy2025_volume_pumped_af);
    const assetCode = `BPS-${String(index + 1).padStart(4, "0")}`;

    await writeAsset(prisma, {
      organizationId,
      assetTypeId,
      definitions,
      input: {
        assetCode,
        name: zone ? `${zone} — ${location ?? "booster pump station"}` : (location as string),
        installationDate: null,
        attributes: {
          FACILITY_ID: assetCode,
          ADDRESS: location,
          ZONE: zone,
          CAPACITY_CFS: num(row.capacity_cfs),
          TOTAL_HP: hp,
          AVG_DYNAMIC_LIFT_FT: num(row.avg_dynamic_lift_ft),
          VOLUME_PUMPED_AF: volume,
          TOTAL_POWER_COST: num(row.total_power_cost_fy2025),
          AVG_COST_PER_AF: num(row.avg_cost_per_af),
        },
      },
    });
    created++;
    totalHp += hp ?? 0;
    totalVolumeAf += volume ?? 0;
  }

  return { created, totalHp, totalVolumeAf, warnings };
}
