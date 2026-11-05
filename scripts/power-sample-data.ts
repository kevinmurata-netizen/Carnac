import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { POWER_DISTRIBUTION, type PackType } from "../src/config/starter-packs";

/**
 * Sample data for the power distribution starter pack: a small made-up
 * cooperative, Ridgeway, written as the CSV files Data Import takes — so
 * loading it goes the way a real utility's data would, through the importer
 * and nothing else.
 *
 *   npm run samples:power
 *
 * Three feeders run north from one substation, a pole every 250 ft, with
 * transformers on every third pole, pad-mounted units where a feeder serves
 * the commercial park, and conductor in sections of about 1,000 ft drawn
 * over the poles that carry it. Each feeder was built in a different era, so
 * the network ages unevenly: the oldest is due for work, the newest is not.
 * Inspection scores follow age against each material's curve, with the odd
 * pole that has done worse than its years.
 *
 * Nothing here reads a database. The columns are the pack's own labels, so
 * the files keep matching the types the pack creates.
 */

const OUT_DIR = join(__dirname, "..", "public", "samples", POWER_DISTRIBUTION.id);

const SPAN_FT = 250;
const FEET_PER_DEGREE_LAT = 364_000;
const SUBSTATION = { lat: 38.35, lng: -97.66 };
/** A mile between feeders, the spacing of the section roads they follow. */
const FEEDER_SPACING_DEG = 0.0185;
const POLES_PER_FEEDER = 44;
const SPANS_PER_SECTION = 4;
/** The inspection cycles in the files. */
const POLE_CYCLES = [2016, 2024];
const TRANSFORMER_CYCLES = [2019, 2023];
const PATROL_YEAR = 2025;

type Feeder = {
  circuit: string;
  area: string;
  built: [number, number];
  customers: number;
  preservative: string;
  conductor: { type: string; size: string; built: number };
  /** Poles feeding somewhere that cannot lose supply. */
  critical?: [number, number];
  /** A share of its transformers pad-mounted, for commercial load. */
  padShare: number;
};

const FEEDERS: Feeder[] = [
  { circuit: "RW-101", area: "West Fields", built: [1962, 1976], customers: 380, preservative: "Creosote", conductor: { type: "Copper", size: "4/0", built: 1966 }, padShare: 0 },
  { circuit: "RW-102", area: "Ridgeway Town", built: [1978, 1996], customers: 640, preservative: "Penta", conductor: { type: "ACSR", size: "336.4 kcmil", built: 1984 }, critical: [18, 24], padShare: 0.15 },
  { circuit: "RW-103", area: "Commerce Park", built: [1998, 2016], customers: 260, preservative: "CCA", conductor: { type: "AAAC", size: "477 kcmil", built: 2004 }, padShare: 0.6 },
];

/** A seeded generator, so every run writes the same files. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261021);
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const intBetween = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
const pad = (n: number, width: number) => String(n).padStart(width, "0");

function typeOf(code: string): PackType {
  const type = POWER_DISTRIBUTION.types.find((t) => t.code === code);
  if (!type) throw new Error(`The pack has no ${code}`);
  return type;
}
const POLE = typeOf("POLE");
const TRANSFORMER = typeOf("DIST_TRANSFORMER");
const CONDUCTOR = typeOf("OH_CONDUCTOR");

const lifeOf = (type: PackType, material: string) => {
  const curve = type.curves.find((c) => c.material === material);
  if (!curve) throw new Error(`${type.name} has no curve for ${material}`);
  return curve;
};

/** A 1–10 score for one question, from how far through its life the asset
 * was when inspected: 10 when new, falling faster with age. Plenty outlast
 * their rated life, so at that age most still score fair; it is the ones
 * well past it, or weak for their years, that score poorly. */
function score(type: PackType, material: string, installed: number, year: number, quality: number, weakness: number): number {
  const { serviceLife, shape } = lifeOf(type, material);
  const used = Math.max(0, year - installed) / serviceLife;
  const raw = 10 - 8 * Math.pow(used / 1.5, shape) + quality - weakness + between(-0.6, 0.6);
  return Math.min(10, Math.max(1, Math.round(raw)));
}

/** A date in the year's inspection season. */
const dateIn = (year: number) => `${year}-${pad(intBetween(3, 10), 2)}-${pad(intBetween(1, 28), 2)}`;

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: Array<Record<string, string | number>>) => {
  const headers = Object.keys(rows[0]);
  return [headers.map(csvCell).join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h] ?? "")).join(","))].join("\n") + "\n";
};

const label = (type: PackType, code: string) => {
  const attribute = type.attributes.find((a) => a.code === code);
  if (!attribute) throw new Error(`${type.name} has no ${code}`);
  return attribute.label;
};

/** One inspection row: the asset, its date, and a score per question on the
 * type's form, with a follow-up flagged where any question scored 3 or less. */
function inspection(type: PackType, assetId: string, material: string, installed: number, year: number, quality: number, weakness: Record<string, number>, note: string) {
  const scores = Object.fromEntries(
    type.index.components.map((c) => [c.label, score(type, material, installed, year, quality, weakness[c.code] ?? 0)])
  );
  const low = Object.values(scores).some((s) => s <= 3);
  return {
    "Asset ID": assetId,
    "Inspection Date": dateIn(year),
    "Inspection Type": "Routine",
    "Follow-up": low ? "Yes" : "No",
    Notes: low ? note : "",
    ...scores,
  };
}

const poles: Array<Record<string, string | number>> = [];
const transformers: Array<Record<string, string | number>> = [];
const conductors: Array<Record<string, string | number>> = [];
const poleInspections: Array<Array<Record<string, string | number>>> = POLE_CYCLES.map(() => []);
const transformerInspections: Array<Record<string, string | number>> = [];
const patrols: Array<Record<string, string | number>> = [];

FEEDERS.forEach((feeder, f) => {
  const lng = SUBSTATION.lng + (f - 1) * FEEDER_SPACING_DEG;
  const latAt = (i: number) => SUBSTATION.lat + ((i + 1) * SPAN_FT) / FEET_PER_DEGREE_LAT;
  const servedAt = (i: number) => Math.max(8, Math.round(feeder.customers * (1 - i / POLES_PER_FEEDER)));
  const criticalityAt = (i: number) =>
    feeder.critical && i >= feeder.critical[0] && i <= feeder.critical[1]
      ? "Critical"
      : i < 6
        ? "High"
        : i < POLES_PER_FEEDER / 2
          ? "Medium"
          : "Low";

  const poleYears: number[] = [];
  for (let i = 0; i < POLES_PER_FEEDER; i++) {
    const id = `P-${feeder.circuit.slice(3)}-${pad(i + 1, 3)}`;
    // Road crossings every eleventh pole are taller and, on the older
    // feeders, often already replaced in steel or concrete.
    const crossing = i % 11 === 10;
    let installed = intBetween(feeder.built[0], feeder.built[1]);
    let material = "Wood";
    let preservative = feeder.preservative;
    if (crossing && rand() < 0.6) {
      material = pick(["Steel", "Concrete"]);
      installed = intBetween(2005, 2020);
      preservative = "None";
    } else if (rand() < 0.12) {
      // Replaced after a storm or a failed test.
      installed = intBetween(2006, 2024);
      material = rand() < 0.25 ? "Composite" : "Wood";
      preservative = material === "Wood" ? pick(["CCA", "Copper Naphthenate"]) : "None";
    }
    const height = crossing ? 45 : pick([35, 40, 40, 40, 40, 45]);
    poleYears.push(installed);
    poles.push({
      "Asset ID": id,
      "Installation Year": installed,
      Latitude: latAt(i).toFixed(6),
      Longitude: lng.toFixed(6),
      [label(POLE, "MATERIAL")]: material,
      [label(POLE, "HEIGHT")]: height,
      [label(POLE, "POLE_CLASS")]: height >= 45 ? "2" : height === 40 ? "3" : "4",
      [label(POLE, "PRESERVATIVE")]: preservative,
      [label(POLE, "CIRCUIT")]: feeder.circuit,
      [label(POLE, "CUSTOMERS_SERVED")]: servedAt(i),
      [label(POLE, "CRITICALITY")]: criticalityAt(i),
      "Service Area": feeder.area,
    });

    // About one wood pole in twelve has done worse than its age: decay at
    // ground line, or a woodpecker in the top.
    // How well this one has held up for its age, the same at every visit.
    const quality = between(-1, 1);
    const weakness: Record<string, number> = {};
    if (material === "Wood" && rand() < 0.08) weakness.GROUNDLINE_STRENGTH = between(2, 4);
    if (material === "Wood" && rand() < 0.06) weakness.SURFACE = between(2, 5);
    if (rand() < 0.05) weakness.LEAN = between(2, 4);
    POLE_CYCLES.forEach((year, c) => {
      if (installed < year) {
        poleInspections[c].push(inspection(POLE, id, material, installed, year, quality, weakness, pick(["Shell rot at ground line", "Woodpecker holes near the top", "Leaning; guy slack", "Crossarm split"])));
      }
    });

    // A transformer on every third pole, offset a little east of it.
    if (i % 3 === 1) {
      const padMounted = rand() < feeder.padShare;
      const id = `T-${feeder.circuit.slice(3)}-${pad(Math.floor(i / 3) + 1, 2)}`;
      const unitInstalled = rand() < 0.3 ? intBetween(Math.max(installed, 2000), 2023) : Math.max(installed, feeder.built[0]);
      const mounting = padMounted ? "Pad-mounted" : "Pole-mounted";
      const offsetFt = padMounted ? 150 : 30;
      transformers.push({
        "Asset ID": id,
        "Installation Year": unitInstalled,
        Latitude: latAt(i).toFixed(6),
        Longitude: (lng + offsetFt / (FEET_PER_DEGREE_LAT * Math.cos((SUBSTATION.lat * Math.PI) / 180))).toFixed(6),
        [label(TRANSFORMER, "MOUNTING")]: mounting,
        [label(TRANSFORMER, "KVA")]: padMounted ? pick([75, 150, 300, 500]) : pick([25, 25, 37.5, 50]),
        [label(TRANSFORMER, "PHASE")]: padMounted ? "Three" : "Single",
        [label(TRANSFORMER, "COOLING")]: unitInstalled >= 2015 ? "Natural ester" : "Mineral oil",
        [label(TRANSFORMER, "CIRCUIT")]: feeder.circuit,
        [label(TRANSFORMER, "CUSTOMERS_SERVED")]: padMounted ? pick([1, 1, 24, 36]) : intBetween(4, 12),
        [label(TRANSFORMER, "CRITICALITY")]: criticalityAt(i) === "Critical" ? "Critical" : padMounted ? "Medium" : "Low",
        "Service Area": feeder.area,
      });
      const quality = between(-1, 1);
      const weakness: Record<string, number> = {};
      if (rand() < 0.1) weakness.OIL_LEAKS = between(2, 4);
      if (rand() < 0.08) weakness.LOADING = between(2, 4);
      TRANSFORMER_CYCLES.forEach((year) => {
        if (unitInstalled < year && (year === TRANSFORMER_CYCLES[1] || rand() < 0.5)) {
          transformerInspections.push(inspection(TRANSFORMER, id, mounting, unitInstalled, year, quality, weakness, pick(["Oil weeping at the lower gasket", "Runs hot at peak load", "Tank rusting through at the base"])));
        }
      });
    }
  }

  // Conductor in sections of four spans, each drawn north–south over the
  // poles that carry it. The first section leaves the substation.
  const spans = POLES_PER_FEEDER;
  for (let s = 0, n = 1; s < spans; s += SPANS_PER_SECTION, n++) {
    const count = Math.min(SPANS_PER_SECTION, spans - s);
    const lengthFt = count * SPAN_FT;
    const id = `C-${feeder.circuit.slice(3)}-${pad(n, 2)}`;
    const midLat = SUBSTATION.lat + ((s + count / 2) * SPAN_FT) / FEET_PER_DEGREE_LAT;
    const reconductored = rand() < 0.15;
    const installed = reconductored ? intBetween(2008, 2022) : feeder.conductor.built + intBetween(0, 4);
    const type = reconductored ? "AAAC" : feeder.conductor.type;
    conductors.push({
      "Asset ID": id,
      "Installation Year": installed,
      Latitude: midLat.toFixed(6),
      Longitude: lng.toFixed(6),
      [label(CONDUCTOR, "CONDUCTOR_TYPE")]: type,
      [label(CONDUCTOR, "LENGTH")]: lengthFt,
      [label(CONDUCTOR, "CONDUCTOR_SIZE")]: reconductored ? "477 kcmil" : feeder.conductor.size,
      [label(CONDUCTOR, "PHASES")]: "3",
      [label(CONDUCTOR, "VOLTAGE")]: 12.47,
      [label(CONDUCTOR, "CIRCUIT")]: feeder.circuit,
      [label(CONDUCTOR, "CUSTOMERS_SERVED")]: servedAt(s),
      [label(CONDUCTOR, "CRITICALITY")]: criticalityAt(s),
      "Service Area": feeder.area,
    });
    const quality = between(-1, 1);
    const weakness: Record<string, number> = {};
    if (rand() < 0.2) weakness.VEGETATION = between(3, 6);
    if (type === "Copper" && rand() < 0.4) weakness.SPLICES = between(2, 4);
    patrols.push(inspection(CONDUCTOR, id, type, installed, PATROL_YEAR, quality, weakness, pick(["Tree limbs in the conductor", "Hot splice on the infrared survey", "Broken strands at a clamp"])));
  }
});

const byDate = (rows: Array<Record<string, string | number>>) =>
  [...rows].sort((a, b) => String(a["Inspection Date"]).localeCompare(String(b["Inspection Date"])));

mkdirSync(OUT_DIR, { recursive: true });
const files: Array<[string, Array<Record<string, string | number>>]> = [
  ["poles.csv", poles],
  ["transformers.csv", transformers],
  ["overhead-conductor.csv", conductors],
  ...POLE_CYCLES.map((year, c): [string, Array<Record<string, string | number>>] => [`pole-inspections-${year}.csv`, byDate(poleInspections[c])]),
  ["transformer-inspections.csv", byDate(transformerInspections)],
  ["line-patrols.csv", byDate(patrols)],
];
for (const [name, rows] of files) {
  writeFileSync(join(OUT_DIR, name), toCsv(rows));
  console.log(`${name}: ${rows.length} rows`);
}
