import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { buildOption, explainApplicability, type TreatmentDef } from "../src/domain/waterline/treatment";
import { loadTreatmentDefs } from "../src/server/treatment-config";
import { assetTreatmentContext } from "../src/server/workplans";
import { workPlanImportTemplate } from "../src/server/workplan-import";

/**
 * Sample files for testing the work plan import against the sample network:
 * five years of programmed work, 2026–2030, filled into the app's own
 * template.
 *
 * Each row is something the import should accept on the sample data: an
 * active segment, a treatment its rules allow there and a rate prices, in a
 * year inside a 2026–2030 plan. Worst segments first, as a real capital
 * programme would be, with renewals spread over the years they are decided,
 * paid for and built. A second file adds a handful of rows each wrong in one
 * way, to see that nothing imports while any row has an error.
 *
 *   npm run db:sample:work-plan-import
 *
 * Written from the local database, so it uses only what production shares
 * with it: the seeded segments and the seeded treatment library. No
 * combinations — those are each organization's own setup, and the first
 * version of this file named a "Dig-once repair" production never had. And
 * not the segments below, which are active locally but not on production.
 */

/** Active here, not on production (2026-10-05): a row on either is refused
 * there. Swapped for another segment from the same condition band. */
const NOT_ACTIVE_ON_PRODUCTION = new Set(["WL-0206", "WL-0253"]);

const OUT_DIR = join(__dirname, "..", "prisma", "sample-data");
const FIRST_YEAR = 2026;
const YEARS = 5;
const PER_YEAR = 6;

/** What a utility would reach for at each condition, in order of preference. */
function preferences(condition: number): string[] {
  if (condition < 35) return ["Replacement", "Rehabilitation", "Relining", "Lining"];
  if (condition < 55) return ["Rehabilitation", "Lining", "Relining", "Replacement"];
  if (condition < 75) return ["Lining", "Spot Repair", "Cathodic Protection", "Coating"];
  return ["Spot Repair", "Coating", "Leak Repair"];
}

const FUNDING = ["Capital Improvement Program", "Road reconstruction (dig once)", "State revolving fund"];

async function main() {
  const org = await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const library = await loadTreatmentDefs(org.id);
  const byName = new Map(library.map((d) => [d.name, d]));

  // The segments in the worst condition first, by their latest measurement.
  const segments = await prisma.asset.findMany({
    where: { organizationId: org.id, deletedAt: null, status: "ACTIVE", assetType: { isModelled: true } },
    select: {
      id: true,
      assetCode: true,
      conditionMeasurements: {
        where: { assetComponentId: null },
        orderBy: { measurementDate: "desc" },
        take: 1,
        select: { score: true },
      },
    },
  });
  const ranked = segments
    .filter((s) => s.conditionMeasurements[0])
    .sort((a, b) => a.conditionMeasurements[0].score - b.conditionMeasurements[0].score);

  // Two segments a year from each condition band, worst first within it: a
  // programme renews what has failed, rehabilitates what is failing and
  // repairs what is still sound, rather than spending five years on the very
  // worst pipes alone.
  const bands = [
    ranked.filter((s) => s.conditionMeasurements[0].score < 35),
    ranked.filter((s) => s.conditionMeasurements[0].score >= 35 && s.conditionMeasurements[0].score < 55),
    ranked.filter((s) => s.conditionMeasurements[0].score >= 55 && s.conditionMeasurements[0].score < 80),
  ];
  const PER_BAND = PER_YEAR / bands.length;

  const rows: Array<Record<string, string | number>> = [];

  for (let y = 0; y < YEARS; y++) {
    const year = FIRST_YEAR + y;
    for (const band of bands) {
      let taken = 0;
      while (taken < PER_BAND && band.length > 0) {
        // A segment production doesn't have active is swapped for one from the
        // far end of the band rather than the next in line, so every other
        // row keeps the segment it had — the rows production already accepted.
        let segment = band.shift()!;
        if (NOT_ACTIVE_ON_PRODUCTION.has(segment.assetCode)) {
          while (band.length > 0 && NOT_ACTIVE_ON_PRODUCTION.has(band[band.length - 1].assetCode)) band.pop();
          if (band.length === 0) break;
          segment = band.pop()!;
        }
        const row = await projectFor(segment, year, rows.length);
        if (!row) continue;
        rows.push({ ...row, notes: `CIP-${year}-${String(rows.filter((r) => r["year"] === year).length + 1).padStart(3, "0")} · condition ${Math.round(segment.conditionMeasurements[0].score)}` });
        taken++;
      }
    }
  }

  /** A project this segment's rules allow and a rate prices, or null. */
  async function projectFor(
    segment: (typeof ranked)[number],
    year: number,
    index: number
  ): Promise<Record<string, string | number> | null> {
    const context = await assetTreatmentContext(org.id, segment.id);
    if (!context) return null;
    const { ctx } = context;
    const condition = segment.conditionMeasurements[0].score;

    let name: string | null = null;
    let members: TreatmentDef[] = [];
    for (const candidate of preferences(condition)) {
      const def = byName.get(candidate);
      if (!def || !explainApplicability(def, ctx).pass) continue;
      if (!buildOption(`t:${def.name}`, def.name, [def], ctx, null)) continue;
      name = def.name;
      members = [def];
      break;
    }
    if (!name) return null;

    const option = buildOption(`x:${name}`, name, members, ctx, null)!;
    const renewal = members.some((m) => m.name === "Replacement" || m.name === "Rehabilitation");
    // Renewals are decided a year ahead and built the year after they are
    // paid for — the multi-year projects a locked scenario must keep its hands
    // off. Everything else is decided, paid for and built in its year.
    const programmed = renewal && year > FIRST_YEAR ? year - 1 : year;
    const build = renewal ? year + 1 : year;

    return {
      asset: segment.assetCode,
      treatment: name,
      year,
      programmed: programmed === year ? "" : programmed,
      build: build === year ? "" : build,
      // A real estimate on some rows, the library's price on the rest.
      cost: index % 4 === 0 ? Math.round((option.cost * 1.1) / 5000) * 5000 : "",
      status: year === FIRST_YEAR ? (index % 2 === 0 ? "In Progress" : "Approved") : year === FIRST_YEAR + 1 ? "Approved" : "Planned",
      funding: FUNDING[index % FUNDING.length],
    };
  }

  const mistakes: Array<Record<string, string | number>> = [
    { asset: "WL-9999", treatment: "Spot Repair", year: 2027, notes: "Mistake: no such segment" },
    { asset: rows[0].asset, treatment: "Pipe Bursting", year: 2028, notes: "Mistake: not in the treatment library" },
    { asset: rows[1].asset, treatment: "Spot Repair", year: 2034, notes: "Mistake: outside a 2026–2030 plan" },
    { asset: rows[2].asset, treatment: "Spot Repair", year: 2029, cost: "TBD", notes: "Mistake: cost is not an amount" },
    {
      asset: rows[3].asset,
      treatment: "Replacement",
      year: 2027,
      programmed: 2029,
      notes: "Mistake: programmed after the year it is paid for",
    },
  ];

  mkdirSync(OUT_DIR, { recursive: true });
  const clean = join(OUT_DIR, "work-plan-import-2026-2030.xlsx");
  const broken = join(OUT_DIR, "work-plan-import-2026-2030-with-errors.xlsx");
  writeFileSync(clean, await workPlanImportTemplate(org.id, rows));
  writeFileSync(broken, await workPlanImportTemplate(org.id, [...rows, ...mistakes]));

  const byYear = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.year]: (acc[r.year] ?? 0) + 1 }), {})
  );
  console.log(`Wrote ${clean}`);
  console.log(`  ${rows.length} projects — ${byYear.map(([y, n]) => `${y}: ${n}`).join(", ")}`);
  console.log(`Wrote ${broken}`);
  console.log(`  the same, plus ${mistakes.length} rows each wrong in one way`);
}

main().finally(() => prisma.$disconnect());
