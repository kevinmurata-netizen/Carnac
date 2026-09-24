import { PrismaClient } from "@prisma/client";
import { num, readCsv, text } from "./csv";
import { assetTypeByCode, definitionsFor, writeAsset } from "./write-asset";

/**
 * JVWCD's groundwater wells: 28 of them, with three years of production.
 *
 * Production is kept twice on purpose. The most recent year is a number, which
 * is what anything sorting or ranking can read; the three-year series is JSON
 * text beside it, because the attribute model has no series type and a field
 * per year would need new definitions every year.
 *
 * A well that produced nothing is not a gap. Several wells report zero acre-feet
 * and a real power bill, which is what a standby well looks like, so zero is
 * written as zero and only an empty cell is left absent.
 */
export async function importWells(prisma: PrismaClient, organizationId: string) {
  const assetTypeId = await assetTypeByCode(prisma, "WELL");
  const definitions = await definitionsFor(prisma, assetTypeId);
  const rows = readCsv("jvwcd_wells.csv");

  let created = 0;
  let idle = 0;
  let totalProductionAf = 0;
  const warnings: string[] = [];

  for (const [index, row] of rows.entries()) {
    const location = text(row.location);
    if (!location) {
      warnings.push(`row ${index + 2} has no location and was skipped`);
      continue;
    }

    const history: Record<string, number> = {};
    for (const [key, value] of Object.entries(row)) {
      const year = key.match(/^fy(\d{4})_production_af$/)?.[1];
      const af = num(value);
      if (year && af != null) history[year] = af;
    }
    const latestYear = Object.keys(history).sort().at(-1);
    const latest = latestYear ? history[latestYear] : null;
    if (latest === 0) idle++;

    const assetCode = `WELL-${String(index + 1).padStart(4, "0")}`;
    await writeAsset(prisma, {
      organizationId,
      assetTypeId,
      definitions,
      input: {
        assetCode,
        name: location,
        // No drilling year in the source, so a well has no age here. Left
        // empty rather than guessed.
        installationDate: null,
        attributes: {
          FACILITY_ID: assetCode,
          ADDRESS: location,
          DESIGN_CAPACITY_CFS: num(row.design_capacity_cfs),
          WELL_SETTING_LEVEL_FT: num(row.well_setting_level_ft),
          ANNUAL_PRODUCTION_AF: latest,
          ANNUAL_PRODUCTION_HISTORY: Object.keys(history).length > 0 ? JSON.stringify(history) : null,
          TOTAL_POWER_COST: num(row.total_power_cost_fy2025),
          AVG_COST_PER_AF: num(row.avg_cost_per_af),
        },
      },
    });
    created++;
    totalProductionAf += latest ?? 0;
  }

  return { created, idle, totalProductionAf: Math.round(totalProductionAf), warnings };
}
