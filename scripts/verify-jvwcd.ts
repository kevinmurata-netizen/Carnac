import { prisma } from "@/lib/prisma";
import { readCsv, num } from "../prisma/jvwcd/csv";

const attrs = async (assetCode: string) => {
  const asset = await prisma.asset.findFirstOrThrow({
    where: { assetCode },
    include: { attributeValues: { include: { definition: { select: { code: true, unit: true } } } }, assetType: true },
  });
  const map = new Map<string, string | number | Date>();
  for (const v of asset.attributeValues) {
    map.set(v.definition.code, v.numberValue ?? v.dateValue ?? v.textValue ?? "");
  }
  return { asset, map };
};

async function main() {
  const counts = await prisma.assetType.findMany({
    select: { code: true, _count: { select: { assets: true } } },
    orderBy: { code: "asc" },
  });
  console.log("counts:");
  for (const c of counts) console.log(`  ${c.code.padEnd(22)} ${c._count.assets}`);

  // Pipe: every band's stored length against the CSV, and miles as a check on
  // the length rather than as a second source of truth.
  const pipeRows = readCsv("jvwcd_pipe_inventory.csv");
  let mismatched = 0;
  for (const row of pipeRows) {
    const label = row.diameter_in;
    const code = `PIPE-${label.replace(/</g, "LT").replace(/>/g, "GT").replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "").toUpperCase()}`;
    const { map } = await attrs(code);
    const stored = Number(map.get("LENGTH"));
    const published = num(row.length_ft)!;
    const miles = Math.round((stored / 5280) * 100) / 100;
    const publishedMiles = num(row.miles)!;
    // The published mileage is rounded to three significant figures, so it is
    // a sanity check on the length rather than a figure to match exactly.
    const milesOff = Math.abs(miles - publishedMiles);
    if (stored !== published || milesOff > Math.max(0.06, publishedMiles * 0.01)) {
      mismatched++;
      console.log(`  MISMATCH ${code}: stored ${stored} LF vs published ${published}; ${miles} mi vs ${publishedMiles} mi`);
    }
  }
  console.log(`\npipe bands checked: ${pipeRows.length}, mismatched: ${mismatched}`);

  const eight = await attrs("PIPE-8");
  console.log(
    `  8" band -> ${eight.map.get("LENGTH")} LF, ${Math.round((Number(eight.map.get("LENGTH")) / 5280) * 10) / 10} mi, diameter ${eight.map.get("DIAMETER")}, band "${eight.map.get("DIAMETER_BAND")}", ${eight.map.get("VALVE_COUNT")} valves, ${eight.map.get("PCT_OF_SYSTEM")}% of system`
  );
  const under2 = await attrs("PIPE-LT2");
  console.log(`  <2 band -> ${under2.map.get("LENGTH")} LF, diameter ${under2.map.get("DIAMETER")}, band "${under2.map.get("DIAMETER_BAND")}"`);

  // Reservoirs: capacity total, age spread, inspection gaps.
  const resRows = readCsv("jvwcd_reservoirs.csv");
  const publishedMg = resRows.reduce((s, r) => s + (num(r.capacity_mg) ?? 0), 0);
  const stored = await prisma.assetAttributeValue.aggregate({
    where: { definition: { code: "CAPACITY_MG", assetType: { code: "RESERVOIR" } } },
    _sum: { numberValue: true },
  });
  const years = await prisma.asset.findMany({
    where: { assetType: { code: "RESERVOIR" } },
    select: { assetCode: true, name: true, installationDate: true },
    orderBy: { installationDate: "asc" },
  });
  const withYear = years.filter((y) => y.installationDate);
  console.log(
    `\nreservoirs: ${Math.round((stored._sum.numberValue ?? 0) * 100) / 100} MG stored vs ${Math.round(publishedMg * 100) / 100} MG published`
  );
  console.log(
    `  build years ${withYear[0]?.installationDate?.getUTCFullYear()}–${withYear.at(-1)?.installationDate?.getUTCFullYear()}, ${years.length - withYear.length} with no year`
  );
  console.log(`  oldest: ${withYear[0]?.name}`);
  console.log(`  newest: ${withYear.at(-1)?.name}`);

  const inspected = await prisma.assetAttributeValue.findMany({
    where: { definition: { code: "LAST_INSPECTED", assetType: { code: "RESERVOIR" } }, dateValue: { not: null } },
    select: { dateValue: true },
  });
  const inspectionYears = inspected.map((i) => i.dateValue!.getUTCFullYear()).sort();
  console.log(
    `  last inspected: ${inspectionYears[0]} to ${inspectionYears.at(-1)}, ${years.length - inspected.length} with none`
  );
  const gaps = new Map<number, number>();
  for (const y of inspectionYears) gaps.set(y, (gaps.get(y) ?? 0) + 1);
  console.log(`  by year: ${[...gaps].sort().map(([y, n]) => `${y}:${n}`).join("  ")}`);

  // Wells: the multi-year series.
  const well = await prisma.asset.findFirstOrThrow({
    where: { assetType: { code: "WELL" }, attributeValues: { some: { definition: { code: "ANNUAL_PRODUCTION_AF" }, numberValue: { gt: 0 } } } },
    select: { assetCode: true, name: true },
  });
  const w = await attrs(well.assetCode);
  console.log(`\nwell ${well.assetCode} — ${well.name}`);
  console.log(`  capacity ${w.map.get("DESIGN_CAPACITY_CFS")} cfs, setting ${w.map.get("WELL_SETTING_LEVEL_FT")} ft`);
  console.log(`  latest production ${w.map.get("ANNUAL_PRODUCTION_AF")} AF, history ${w.map.get("ANNUAL_PRODUCTION_HISTORY")}`);
  console.log(`  power $${w.map.get("TOTAL_POWER_COST")}, $${w.map.get("AVG_COST_PER_AF")}/AF`);

  // Booster pumps.
  const pump = await attrs("BPS-0003");
  console.log(`\npump ${pump.asset.assetCode} — ${pump.asset.name}`);
  console.log(
    `  zone ${pump.map.get("ZONE")}, ${pump.map.get("CAPACITY_CFS")} cfs, ${pump.map.get("TOTAL_HP")} hp, lift ${pump.map.get("AVG_DYNAMIC_LIFT_FT")} ft, ${pump.map.get("VOLUME_PUMPED_AF")} AF`
  );

  await prisma.$disconnect();
}
main();
