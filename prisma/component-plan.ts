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
