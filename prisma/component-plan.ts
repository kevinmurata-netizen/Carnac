/**
 * The sample components: what each facility type is made of, and the
 * condition history each sample facility's parts start with.
 *
 * Pure data and arithmetic, with no database, so the seeder
 * (prisma/components.ts) and the SQL generator (scripts/components-sql.ts)
 * read the same plan and cannot drift apart.
 *
 * Pipes and valves are deliberately absent: whether they warrant component-
 * level tracking is an open question, not a default to seed.
 */

import { probabilityFromCondition } from "../src/domain/components/inspection";

export type ComponentSpec = {
  code: string;
  name: string;
  description: string;
  /** JSON Schema for the component's own fields. */
  attributeSchema: object;
};

export const COMPONENT_TYPES: ComponentSpec[] = [
  {
    code: "TANK_SHELL",
    name: "Tank Shell",
    description: "The walls that hold the water — steel plate or concrete.",
    attributeSchema: {
      type: "object",
      properties: {
        material: { type: "string", enum: ["Steel", "Concrete", "Prestressed Concrete"], title: "Material" },
        wallThicknessIn: { type: "number", minimum: 0, title: "Wall thickness (in)" },
      },
    },
  },
  {
    code: "ROOF",
    name: "Roof",
    description: "The roof, its structure and its hatches.",
    attributeSchema: { type: "object", properties: { roofType: { type: "string", enum: ["Dome", "Cone", "Flat slab"], title: "Roof type" } } },
  },
  {
    code: "FLOOR",
    name: "Floor",
    description: "The floor slab or bottom plate.",
    attributeSchema: { type: "object", properties: { material: { type: "string", title: "Material" } } },
  },
  {
    code: "COATING_SYSTEM",
    name: "Coating System",
    description: "Interior and exterior coatings. Recoated on its own cycle, independent of the structure.",
    attributeSchema: {
      type: "object",
      properties: {
        system: { type: "string", title: "Coating system" },
        lastRecoatYear: { type: "integer", title: "Last recoated (year)" },
        dryFilmThicknessMils: { type: "number", minimum: 0, title: "Dry film thickness (mils)" },
      },
    },
  },
  {
    code: "CATHODIC_PROTECTION",
    name: "Cathodic Protection",
    description: "Anodes or impressed-current system protecting steel from corrosion.",
    attributeSchema: {
      type: "object",
      properties: { system: { type: "string", enum: ["Galvanic", "Impressed current"], title: "System" }, lastSurveyYear: { type: "integer", title: "Last surveyed (year)" } },
    },
  },
  {
    code: "WELL_CASING",
    name: "Casing",
    description: "The well casing and its grout seal.",
    attributeSchema: { type: "object", properties: { diameterIn: { type: "number", title: "Diameter (in)" }, depthFt: { type: "number", title: "Depth (ft)" } } },
  },
  {
    code: "PUMP",
    name: "Pump",
    description: "The pump — submersible or vertical turbine in a well, centrifugal in a station.",
    attributeSchema: { type: "object", properties: { make: { type: "string", title: "Make" }, ratedGpm: { type: "number", title: "Rated flow (gpm)" } } },
  },
  {
    code: "MOTOR",
    name: "Motor",
    description: "The electric motor driving the pump.",
    attributeSchema: { type: "object", properties: { horsepower: { type: "number", title: "Horsepower" }, vfd: { type: "boolean", title: "Variable frequency drive" } } },
  },
  {
    code: "WELL_SCREEN",
    name: "Screen",
    description: "The screen admitting water from the aquifer — where fouling shows first.",
    attributeSchema: { type: "object", properties: { slotSizeIn: { type: "number", title: "Slot size (in)" }, material: { type: "string", title: "Material" } } },
  },
  {
    code: "PIPING",
    name: "Piping",
    description: "Station piping, headers and valves.",
    attributeSchema: { type: "object", properties: { material: { type: "string", title: "Material" } } },
  },
  {
    code: "CONTROLS",
    name: "Controls",
    description: "Electrical gear, instrumentation and SCADA.",
    attributeSchema: { type: "object", properties: { plc: { type: "string", title: "PLC" }, scada: { type: "boolean", title: "SCADA" } } },
  },
];

/**
 * What each asset type is made of: the component types in order, each with
 * its share of the asset's replacement cost as a relative weight, how long it
 * lasts before it is renewed, and how much its failure matters (1-5).
 */
export const COMPOSITION: Record<string, Array<{ code: string; weight: number; life: number; consequence: number }>> = {
  RESERVOIR: [
    { code: "TANK_SHELL", weight: 45, life: 80, consequence: 5 },
    { code: "ROOF", weight: 15, life: 45, consequence: 3 },
    { code: "FLOOR", weight: 15, life: 70, consequence: 4 },
    { code: "COATING_SYSTEM", weight: 15, life: 20, consequence: 2 },
    // Consequence 3, not 2: on steel, a failed CP system is how corrosion
    // reaches the shell.
    { code: "CATHODIC_PROTECTION", weight: 10, life: 20, consequence: 3 },
  ],
  WELL: [
    { code: "WELL_CASING", weight: 35, life: 60, consequence: 5 },
    { code: "PUMP", weight: 25, life: 18, consequence: 4 },
    { code: "MOTOR", weight: 20, life: 22, consequence: 3 },
    { code: "WELL_SCREEN", weight: 20, life: 40, consequence: 3 },
  ],
  BOOSTER_PUMP_STATION: [
    { code: "PUMP", weight: 35, life: 20, consequence: 4 },
    { code: "MOTOR", weight: 25, life: 25, consequence: 3 },
    { code: "PIPING", weight: 20, life: 50, consequence: 3 },
    { code: "CONTROLS", weight: 20, life: 15, consequence: 3 },
  ],
};

/**
 * Three reservoirs set by hand rather than by formula, so the roll-up
 * strategies have something distinct to disagree about:
 *   RSV-02 — sound structure, failing cathodic protection (a cheap part).
 *   RSV-06 — a failing shell (the most expensive part).
 *   RSV-05 — everything sound but a tired roof.
 */
export const HAND_SET: Record<string, Record<string, number>> = {
  "RSV-02": { TANK_SHELL: 78, ROOF: 70, FLOOR: 82, COATING_SYSTEM: 48, CATHODIC_PROTECTION: 14 },
  "RSV-06": { TANK_SHELL: 34, ROOF: 58, FLOOR: 66, COATING_SYSTEM: 41, CATHODIC_PROTECTION: 60 },
  "RSV-05": { TANK_SHELL: 91, ROOF: 62, FLOOR: 93, COATING_SYSTEM: 84, CATHODIC_PROTECTION: 88 },
};

/** A small deterministic spread, so re-seeding produces the same network. */
function jitter(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return ((h >>> 0) % 17) - 8; // -8..8
}

/** Condition from age within the component's own renewal cycle: a coating on
 * a 60-year-old reservoir has been renewed, so its age is years since then. */
function conditionFor(assetCode: string, code: string, ageYears: number, life: number) {
  const cycleAge = ageYears % life;
  const base = 100 * (1 - Math.pow(cycleAge / life, 1.6));
  return Math.max(5, Math.min(99, Math.round(base + jitter(`${assetCode}:${code}`))));
}

/** Observed here when the facility doesn't say when it was last inspected. */
export const DEFAULT_OBSERVED_AT = new Date(Date.UTC(2025, 5, 1));

export type PlannedObservation = {
  observedAt: Date;
  conditionScore: number;
  probability: number;
  consequence: number;
};

/**
 * What has been found on one part of one facility, oldest first. The last
 * entry is what the component's snapshot shows.
 *
 * The hand-set reservoirs also get an earlier observation, so the history
 * shows a component getting worse and the snapshot is seen to follow the
 * latest row rather than the first.
 */
export function planComponentHistory(
  assetCode: string,
  installYear: number,
  observedAt: Date,
  part: { code: string; life: number; consequence: number },
  currentYear = new Date().getUTCFullYear()
): PlannedObservation[] {
  const condition = HAND_SET[assetCode]?.[part.code] ?? conditionFor(assetCode, part.code, currentYear - installYear, part.life);
  const latest = { observedAt, conditionScore: condition, probability: probabilityFromCondition(condition), consequence: part.consequence };
  if (!HAND_SET[assetCode]) return [latest];
  const earlier = Math.min(99, condition + 12);
  return [
    {
      observedAt: new Date(Date.UTC(observedAt.getUTCFullYear() - 5, 5, 1)),
      conditionScore: earlier,
      probability: probabilityFromCondition(earlier),
      consequence: part.consequence,
    },
    latest,
  ];
}

// ---------------------------------------------------------------------------
// Site visits: the inspections behind the history above.
// ---------------------------------------------------------------------------

/** A second spread, 0..1, for readings — kept apart from the condition
 * jitter so a reading's noise never moves a score. */
function unit(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

const round = (value: number, places = 0) => Math.round(value * 10 ** places) / 10 ** places;
const severity = (c: number) => (c >= 80 ? "None" : c >= 60 ? "Light" : c >= 40 ? "Moderate" : "Heavy");

export type PlannedReading = number | string | boolean;

/**
 * What an inspector would plausibly have measured on a part in this
 * condition. Sample data, shaped to agree with the rating beside it: a
 * coating rated poor has thin film, failed area and poor adhesion.
 */
export function plannedReadings(code: string, condition: number, seed: string): Record<string, PlannedReading> {
  const n = (key: string) => unit(`${seed}:${key}`);
  const c = condition;
  switch (code) {
    case "TANK_SHELL":
      return {
        MIN_WALL_THICKNESS: round(0.375 * (0.62 + 0.38 * (c / 100)) + (n("wall") - 0.5) * 0.01, 3),
        MAX_PIT_DEPTH: round((100 - c) * 1.1 + n("pit") * 8),
        CRACKING: severity(c + 10),
        LEAKAGE: c >= 45 ? "None" : c >= 25 ? "Weeping" : "Active",
      };
    case "ROOF":
      return {
        COATING_FAILED_PCT: round(Math.max(0, (90 - c) * 0.6 + n("coat") * 4)),
        HATCHES_SECURE: c >= 30 || n("hatch") > 0.5,
        VENT_SCREENS_INTACT: c >= 55,
        DEFLECTION: severity(c + 15),
      };
    case "FLOOR":
      return {
        SEDIMENT_DEPTH: round(1 + (100 - c) / 12 + n("sed") * 2, 1),
        MAX_PIT_DEPTH: round((100 - c) * 0.9 + n("pit") * 6),
        SETTLEMENT: severity(c + 10),
      };
    case "COATING_SYSTEM":
      return {
        DFT_AVG: round(4 + 8 * (c / 100) + (n("dft") - 0.5), 1),
        AREA_FAILED_PCT: round(Math.max(0, (100 - c) * 0.7 - 5 + n("area") * 4)),
        ADHESION: c >= 85 ? "5B" : c >= 70 ? "4B" : c >= 55 ? "3B" : c >= 40 ? "2B" : c >= 25 ? "1B" : "0B",
        HOLIDAYS: round(Math.max(0, (100 - c) / 7 + n("hol") * 3)),
      };
    case "CATHODIC_PROTECTION":
      return {
        // −850 mV is the usual criterion; a failing system sits well short.
        POTENTIAL_MV: -round(600 + 3.2 * c + n("mv") * 20),
        RECTIFIER_OUTPUT_A: round(1.5 + (c / 100) * 4 + n("amp"), 1),
        ANODES_REMAINING_PCT: round(Math.max(0, c * 0.95 - 3 + n("anode") * 5)),
      };
    case "WELL_CASING":
      return {
        VIDEO_FINDINGS: c >= 75 ? "No defects" : c >= 50 ? "Minor" : "Major",
        GROUT_SEAL_INTACT: c >= 40,
        STATIC_LEVEL_FT: round(95 + n("level") * 60),
      };
    case "WELL_SCREEN":
      return {
        SPECIFIC_CAPACITY: round(6 + 22 * (c / 100) + n("sc") * 2, 1),
        ENCRUSTATION: severity(c),
        SAND_PPM: round(Math.max(0, (100 - c) / 9 + n("sand") * 2), 1),
      };
    case "PUMP":
      return {
        FLOW_GPM: round((1200 + n("design") * 1400) * (0.72 + 0.28 * (c / 100)), -1),
        DISCHARGE_PSI: round(62 + (c / 100) * 18 + n("psi") * 4),
        VIBRATION_IPS: round(0.06 + (100 - c) * 0.0035 + n("vib") * 0.02, 2),
        EFFICIENCY_PCT: round(48 + c * 0.3 + n("eff") * 3),
      };
    case "MOTOR":
      return {
        CURRENT_A: round(70 + (100 - c) * 0.25 + n("amp") * 10),
        INSULATION_MOHM: round(15 + c * 4.5 + n("meg") * 40),
        TEMPERATURE_F: round(150 + (100 - c) * 0.7 + n("temp") * 8),
        VIBRATION_IPS: round(0.05 + (100 - c) * 0.003 + n("vib") * 0.02, 2),
      };
    case "PIPING":
      return {
        LEAKS: c >= 50 ? "None" : c >= 30 ? "Weeping" : "Active",
        EXTERNAL_CORROSION: severity(c),
        VALVES_EXERCISED: c >= 40,
      };
    case "CONTROLS":
      return {
        ALARMS_TESTED: c >= 35,
        CALIBRATION_CURRENT: c >= 55,
        BACKUP_POWER_TESTED: c >= 45 || n("gen") > 0.5,
      };
    default:
      return {};
  }
}

export type PlannedVisit = {
  date: Date;
  /** By component type code. */
  parts: Record<string, { condition: number; probability: number; consequence: number }>;
};

/**
 * The site visits behind a facility's history, oldest first: the one its
 * components' current scores came from, and visits five and ten years before
 * it where the facility existed then. A visit on a date the component history
 * already has uses that history's condition exactly, so the visits explain
 * the scores rather than changing them.
 */
export function planSiteVisits(
  assetCode: string,
  installYear: number,
  observedAt: Date,
  parts: Array<{ code: string; life: number; consequence: number }>,
  currentYear = new Date().getUTCFullYear()
): PlannedVisit[] {
  const histories = new Map(
    parts.map((p) => [p.code, planComponentHistory(assetCode, installYear, observedAt, p, currentYear)])
  );
  const dates = [10, 5, 0]
    .map((back) => ({ back, date: back === 0 ? observedAt : new Date(Date.UTC(observedAt.getUTCFullYear() - back, 5, 1)) }))
    .filter(({ date }) => date.getUTCFullYear() > installYear + 1);

  return dates.map(({ back, date }) => ({
    date,
    parts: Object.fromEntries(
      parts.map((p) => {
        const recorded = histories.get(p.code)!.find((o) => o.observedAt.getTime() === date.getTime());
        const condition =
          recorded?.conditionScore ??
          (HAND_SET[assetCode]?.[p.code] != null
            ? Math.min(99, HAND_SET[assetCode][p.code] + (back >= 10 ? 20 : 12))
            : conditionFor(assetCode, p.code, Math.max(0, currentYear - installYear - back), p.life));
        return [p.code, { condition, probability: probabilityFromCondition(condition), consequence: p.consequence }];
      })
    ),
  }));
}

/** A site-form rating, 0-10, near the average condition of the parts seen. */
export function plannedSiteRating(averageCondition: number, seed: string) {
  return Math.max(0, Math.min(10, Math.round(averageCondition / 10 + (unit(seed) - 0.5) * 2)));
}
