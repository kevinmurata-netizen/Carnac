import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { num, readCsv, SEED_DATA_DIR, text } from "./csv";
import { splitBand, type Band, type PipeSegmentConfig } from "./pipe-segments";
import { assetTypeByCode, definitionsFor, writeAsset } from "./write-asset";

/**
 * JVWCD's pipe inventory: 27 rows, one per diameter band.
 *
 * The source is a summary — "8 inch, 303,335 LF, 57.5 miles, 1,246 valves" —
 * so a row is not a pipe. Two honest ways to import it, and this does both:
 *
 * - **As published**: one asset per band. Totals reconcile with the District's
 *   table exactly and nothing is invented, but the model then ranks a single
 *   57-mile object.
 * - **Synthesized**: each band cut into segments by `pipe-segments.json`, so
 *   there is something to rank and schedule. The lengths still reconcile to the
 *   foot, but a segment is a share of a band rather than a pipe on a map.
 *
 * Which one applies is decided by the presence of that config file, and every
 * synthesized asset says so in its description so nobody mistakes one for a
 * real alignment.
 *
 * Pipes go on the existing WATERLINE type. It already carries diameter, length
 * and the treatment library, rules and deterioration curves the model runs on;
 * a parallel "Pipe" type would be a second name for the same thing that no
 * screen in the app reads.
 */

const CONFIG_FILE = "pipe-segments.json";

/**
 * A band's diameter as a number, for the attribute the model actually reads.
 *
 * The published labels are ranges and bounds — "<2", "3-4", "15-16" — and the
 * engine's rules and cost rates compare diameter numerically. The largest
 * diameter in the band is used, because a rule written as "24 inch and above"
 * should catch a 20-21 band at 21 rather than quietly at 20, and the printed
 * label is kept beside it so the source is never lost.
 */
export function bandDiameter(label: string): number | null {
  const numbers = label.match(/\d+(\.\d+)?/g);
  if (!numbers || numbers.length === 0) return null;
  return Math.max(...numbers.map(Number));
}

export function loadSegmentConfig(): PipeSegmentConfig | null {
  const path = join(SEED_DATA_DIR, CONFIG_FILE);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as PipeSegmentConfig & { _comment?: unknown };
  delete parsed._comment;
  return parsed;
}

export async function importPipeInventory(
  prisma: PrismaClient,
  organizationId: string,
  options: { config?: PipeSegmentConfig | null } = {}
) {
  const assetTypeId = await assetTypeByCode(prisma, "WATERLINE");
  const definitions = await definitionsFor(prisma, assetTypeId);
  const config = options.config === undefined ? loadSegmentConfig() : options.config;
  const rows = readCsv("jvwcd_pipe_inventory.csv");

  let bands = 0;
  let assets = 0;
  let totalFeet = 0;
  const warnings: string[] = [];

  for (const row of rows) {
    const label = text(row.diameter_in);
    const lengthFt = num(row.length_ft);
    if (!label || lengthFt == null) {
      warnings.push(`skipped a row with no diameter or length: ${JSON.stringify(row)}`);
      continue;
    }
    bands++;

    const diameter = bandDiameter(label);
    if (diameter == null) warnings.push(`band "${label}" has no number in it, so its diameter is left empty`);

    const valves = num(row.valve_count);
    const share = num(row.pct_of_system);
    const band: Band = { diameter: label, totalLengthFt: lengthFt };
    const segments = config ? splitBand(band, config) : [{ index: 1, lengthFt: Math.round(lengthFt) }];
    // Valves are counted per band, so a segment carries its share of them
    // rather than the band's whole count — and the shares are whole valves
    // that add back up to what the District published.
    const valveShares = valves == null ? null : shareOut(valves, segments.map((s) => s.lengthFt));
    // "<2" and "2" are different bands and must not collapse to the same code,
    // which is what stripping the punctuation alone did.
    const code = label
      .replace(/</g, "LT")
      .replace(/>/g, "GT")
      .replace(/[^0-9A-Za-z]+/g, "-")
      .replace(/^-|-$/g, "")
      .toUpperCase();

    for (const segment of segments) {
      const single = segments.length === 1;
      const assetCode = single ? `PIPE-${code}` : `PIPE-${code}-${String(segment.index).padStart(4, "0")}`;
      const miles = Math.round((segment.lengthFt / 5280) * 100) / 100;

      await writeAsset(prisma, {
        organizationId,
        assetTypeId,
        definitions,
        input: {
          assetCode,
          name: single
            ? `${label}" main — ${lengthFt.toLocaleString("en-US")} LF (${miles} mi)`
            : `${label}" main ${segment.index} of ${segments.length} — ${segment.lengthFt.toLocaleString("en-US")} LF`,
          // No installation year in the source. Left empty rather than guessed:
          // the deterioration model falls back to a default curve, which is
          // honest about not knowing, where an invented year is not.
          installationDate: null,
          attributes: {
            FACILITY_ID: assetCode,
            DIAMETER: diameter,
            DIAMETER_BAND: label,
            LENGTH: segment.lengthFt,
            VALVE_COUNT: valveShares ? valveShares[segment.index - 1] : null,
            // A share of the whole system belongs to the band, not to one
            // segment of it, so it is only written when the band is one asset.
            PCT_OF_SYSTEM: single ? share : null,
            OWNER: "Jordan Valley Water Conservancy District",
            SEGMENT_BASIS: single
              ? "As published: one asset for the whole diameter band."
              : `Synthesized: one of ${segments.length} equal shares of the ${label}" band. Illustrative only — not a real pipe alignment.`,
          },
        },
      });
      assets++;
      totalFeet += segment.lengthFt;
    }
  }

  return { bands, assets, totalFeet, synthesized: config != null, warnings };
}

/** Whole units split in the given proportions, summing to the published total. */
function shareOut(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return weights.map(() => 0);
  const out = weights.map((w) => Math.round((w / sum) * total));
  let drift = Math.round(total) - out.reduce((a, b) => a + b, 0);
  for (let i = 0; drift !== 0 && out.length > 0; i = (i + 1) % out.length) {
    const step = drift > 0 ? 1 : -1;
    if (step < 0 && out[i] <= 0) continue;
    out[i] += step;
    drift -= step;
  }
  return out;
}
