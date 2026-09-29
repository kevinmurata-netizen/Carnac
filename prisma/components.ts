import type { PrismaClient } from "@prisma/client";
import { recordComponentScores } from "../src/server/components";
import { ensureRollupStrategies } from "../src/server/rollup";

/**
 * The components the sample facilities are made of, and what inspections have
 * found on them.
 *
 * Pipes and valves are deliberately absent: whether they warrant component-
 * level tracking is an open question, not a default to seed.
 *
 * Additive and idempotent, like the facilities themselves: types and their
 * links are upserted, and an asset that already has components is left
 * exactly as it is — including every observation recorded against it since.
 */

type ComponentSpec = {
  code: string;
  name: string;
  description: string;
  /** JSON Schema for the component's own fields. */
  attributeSchema: object;
};

const COMPONENT_TYPES: ComponentSpec[] = [
  {
    code: "TANK_SHELL",
    name: "Tank Shell",
    description: "The walls that hold the water — steel plate or concrete.",
    attributeSchema: {
      type: "object",
      properties: {
        material: { type: "string", enum: ["Steel", "Concrete", "Prestressed Concrete"] },
        wallThicknessIn: { type: "number", minimum: 0 },
      },
    },
  },
  {
    code: "ROOF",
    name: "Roof",
    description: "The roof, its structure and its hatches.",
    attributeSchema: { type: "object", properties: { roofType: { type: "string", enum: ["Dome", "Cone", "Flat slab"] } } },
  },
  {
    code: "FLOOR",
    name: "Floor",
    description: "The floor slab or bottom plate.",
    attributeSchema: { type: "object", properties: { material: { type: "string" } } },
  },
  {
    code: "COATING_SYSTEM",
    name: "Coating System",
    description: "Interior and exterior coatings. Recoated on its own cycle, independent of the structure.",
    attributeSchema: {
      type: "object",
      properties: {
        system: { type: "string" },
        lastRecoatYear: { type: "integer" },
        dryFilmThicknessMils: { type: "number", minimum: 0 },
      },
    },
  },
  {
    code: "CATHODIC_PROTECTION",
    name: "Cathodic Protection",
    description: "Anodes or impressed-current system protecting steel from corrosion.",
    attributeSchema: {
      type: "object",
      properties: { system: { type: "string", enum: ["Galvanic", "Impressed current"] }, lastSurveyYear: { type: "integer" } },
    },
  },
  {
    code: "WELL_CASING",
    name: "Casing",
    description: "The well casing and its grout seal.",
    attributeSchema: { type: "object", properties: { diameterIn: { type: "number" }, depthFt: { type: "number" } } },
  },
  {
    code: "PUMP",
    name: "Pump",
    description: "The pump — submersible or vertical turbine in a well, centrifugal in a station.",
    attributeSchema: { type: "object", properties: { make: { type: "string" }, ratedGpm: { type: "number" } } },
  },
  {
    code: "MOTOR",
    name: "Motor",
    description: "The electric motor driving the pump.",
    attributeSchema: { type: "object", properties: { horsepower: { type: "number" }, vfd: { type: "boolean" } } },
  },
  {
    code: "WELL_SCREEN",
    name: "Screen",
    description: "The screen admitting water from the aquifer — where fouling shows first.",
    attributeSchema: { type: "object", properties: { slotSizeIn: { type: "number" }, material: { type: "string" } } },
  },
  {
    code: "PIPING",
    name: "Piping",
    description: "Station piping, headers and valves.",
    attributeSchema: { type: "object", properties: { material: { type: "string" } } },
  },
  {
    code: "CONTROLS",
    name: "Controls",
    description: "Electrical gear, instrumentation and SCADA.",
    attributeSchema: { type: "object", properties: { plc: { type: "string" }, scada: { type: "boolean" } } },
  },
];

/**
 * What each asset type is made of: the component types in order, each with
 * its share of the asset's replacement cost as a relative weight, how long it
 * lasts before it is renewed, and how much its failure matters (1-5).
 */
const COMPOSITION: Record<string, Array<{ code: string; weight: number; life: number; consequence: number }>> = {
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
const HAND_SET: Record<string, Record<string, number>> = {
  "RSV-02": { TANK_SHELL: 78, ROOF: 70, FLOOR: 82, COATING_SYSTEM: 48, CATHODIC_PROTECTION: 14 },
  "RSV-06": { TANK_SHELL: 34, ROOF: 58, FLOOR: 66, COATING_SYSTEM: 41, CATHODIC_PROTECTION: 60 },
  "RSV-05": { TANK_SHELL: 91, ROOF: 62, FLOOR: 93, COATING_SYSTEM: 84, CATHODIC_PROTECTION: 88 },
};

/** Probability of failure, 1-5, from condition. */
function probabilityFrom(condition: number) {
  if (condition >= 85) return 1;
  if (condition >= 70) return 2;
  if (condition >= 50) return 3;
  if (condition >= 30) return 4;
  return 5;
}

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

export async function seedSampleComponents(prisma: PrismaClient, organizationId: string) {
  await ensureRollupStrategies(organizationId);

  const typeIds = new Map<string, string>();
  for (const spec of COMPONENT_TYPES) {
    const row = await prisma.componentType.upsert({
      where: { organizationId_code: { organizationId, code: spec.code } },
      update: { name: spec.name, description: spec.description, attributeSchema: spec.attributeSchema },
      create: { organizationId, ...spec },
      select: { id: true },
    });
    typeIds.set(spec.code, row.id);
  }

  let links = 0;
  let componentsCreated = 0;
  let observations = 0;
  let assetsSkipped = 0;

  for (const [assetTypeCode, parts] of Object.entries(COMPOSITION)) {
    const assetType = await prisma.assetType.findFirst({ where: { code: assetTypeCode, organizationId } });
    if (!assetType) continue;

    for (const [i, part] of parts.entries()) {
      await prisma.assetTypeComponentType.upsert({
        where: { assetTypeId_componentTypeId: { assetTypeId: assetType.id, componentTypeId: typeIds.get(part.code)! } },
        update: { defaultCostWeight: part.weight, sortOrder: i },
        create: {
          assetTypeId: assetType.id,
          componentTypeId: typeIds.get(part.code)!,
          defaultCostWeight: part.weight,
          sortOrder: i,
        },
      });
      links++;
    }

    const assets = await prisma.asset.findMany({
      where: { organizationId, assetTypeId: assetType.id, deletedAt: null },
      include: { components: { select: { id: true } } },
      orderBy: { assetCode: "asc" },
    });

    for (const asset of assets) {
      if (asset.components.length > 0) {
        assetsSkipped++;
        continue;
      }
      const installed = asset.installationDate?.getUTCFullYear() ?? 1990;
      const age = new Date().getUTCFullYear() - installed;
      // Observed where the facility was last inspected, if it says; otherwise
      // the most recent survey season.
      const lastInspected = await prisma.assetAttributeValue.findFirst({
        where: { assetId: asset.id, definition: { code: "LAST_INSPECTED" } },
        select: { dateValue: true },
      });
      const observedAt = lastInspected?.dateValue ?? new Date(Date.UTC(2025, 5, 1));

      for (const part of parts) {
        const component = await prisma.assetComponent.create({
          data: { assetId: asset.id, componentTypeId: typeIds.get(part.code)! },
          select: { id: true },
        });
        componentsCreated++;

        const condition = HAND_SET[asset.assetCode]?.[part.code] ?? conditionFor(asset.assetCode, part.code, age, part.life);

        // The hand-set reservoirs also get an earlier observation, so the
        // history shows a component getting worse and the snapshot is seen
        // to follow the latest row rather than the first.
        if (HAND_SET[asset.assetCode]) {
          const earlier = Math.min(99, condition + 12);
          await recordComponentScores(organizationId, component.id, {
            observedAt: new Date(Date.UTC(observedAt.getUTCFullYear() - 5, 5, 1)),
            conditionScore: earlier,
            probability: probabilityFrom(earlier),
            consequence: part.consequence,
          });
          observations++;
        }
        await recordComponentScores(organizationId, component.id, {
          observedAt,
          conditionScore: condition,
          probability: probabilityFrom(condition),
          consequence: part.consequence,
        });
        observations++;
      }
    }
  }

  return { componentTypes: COMPONENT_TYPES.length, links, componentsCreated, observations, assetsSkipped };
}
