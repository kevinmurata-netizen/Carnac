import { prisma } from "@/lib/prisma";
import { readCsv, num } from "../prisma/jvwcd/csv";
import { loadCache } from "../prisma/jvwcd/geocode";

/** Salt Lake County, roughly: a geocoded point outside it did not land where
 * the District's service area is, whatever the geocoder thought. */
const COUNTY = { minLat: 40.4, maxLat: 40.95, minLng: -112.3, maxLng: -111.55 };

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

  // Geometry: how each asset came by its position, and whether the geocoded
  // ones are anywhere plausible.
  const cache = loadCache();
  const entries = Object.entries(cache);
  const matched = entries.filter(([, v]) => v && !("missed" in v)) as Array<
    [string, Extract<(typeof entries)[number][1], { lat: number }>]
  >;
  const outside = matched.filter(
    ([, m]) => m.lat < COUNTY.minLat || m.lat > COUNTY.maxLat || m.lng < COUNTY.minLng || m.lng > COUNTY.maxLng
  );
  const moved = matched.filter(([, m]) => (m.spreadFt ?? 0) > 100);

  console.log(`\ngeocoding: ${matched.length} of ${entries.length} distinct addresses matched`);
  console.log(`  house number in range: ${matched.filter(([, m]) => m.score === 100).length}`);
  console.log(`  outside Salt Lake County: ${outside.length}`);
  console.log(`  matched in several cities more than 100 ft apart: ${moved.length}`);
  for (const [address] of entries.filter(([, v]) => v && "missed" in v)) console.log(`  no match: ${address}`);

  const basis = await prisma.assetAttributeValue.findMany({
    where: { definition: { code: "LOCATION_BASIS" } },
    select: { textValue: true, asset: { select: { assetType: { select: { code: true } } } } },
  });
  const placed = new Map<string, number>();
  for (const b of basis) {
    const kind = b.textValue?.startsWith("Geocoded")
      ? "geocoded"
      : b.textValue?.startsWith("Illustrative")
        ? "illustrative"
        : "scattered (not a real location)";
    const key = `${b.asset.assetType.code} — ${kind}`;
    placed.set(key, (placed.get(key) ?? 0) + 1);
  }
  console.log("\nhow assets were placed:");
  for (const [k, n] of [...placed].sort()) console.log(`  ${String(n).padStart(3)}  ${k}`);

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) FROM asset_locations`;
  console.log(`  ${String(rows[0].count).padStart(3)}  asset_locations rows in total`);

  // Reservoir scoring: the one class with enough published data to rank, and
  // the check is that it ranks rather than returning the same number 31 times.
  const assessments = await prisma.riskAssessment.findMany({
    where: { asset: { assetType: { code: "RESERVOIR" } } },
    select: {
      riskScore: true,
      probabilityScore: true,
      consequenceScore: true,
      asset: { select: { assetCode: true, name: true } },
      factors: { select: { factorName: true, factorValue: true, weight: true } },
    },
    orderBy: { riskScore: "desc" },
  });

  if (assessments.length > 0) {
    const scores = assessments.map((a) => a.riskScore).sort((a, b) => a - b);
    const distinct = new Set(scores).size;
    console.log(`\nreservoir risk: ${assessments.length} scored`);
    console.log(
      `  range ${scores[0]} to ${scores.at(-1)}, median ${scores[Math.floor(scores.length / 2)]}, ${distinct} distinct scores`
    );
    const top = assessments[0];
    console.log(`  highest: ${top.asset.assetCode} — ${top.asset.name}`);
    console.log(`    risk ${top.riskScore} = pof ${top.probabilityScore} x cof ${top.consequenceScore}`);
    for (const f of top.factors) console.log(`      ${f.factorValue}/5 (weight ${f.weight})  ${f.factorName}`);

    const predictions = await prisma.deteriorationPrediction.findMany({
      where: { asset: { assetType: { code: "RESERVOIR" } } },
      select: { predictedCondition: true },
    });
    const conditions = predictions.map((p) => p.predictedCondition).sort((a, b) => a - b);
    console.log(
      `  modelled condition: ${conditions.length} predictions, ${conditions[0]} to ${conditions.at(-1)} (modelled from age, not measured)`
    );
  }

  await prisma.$disconnect();
}
main();
