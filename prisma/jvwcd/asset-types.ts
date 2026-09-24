import { AttributeDataType, Prisma, PrismaClient } from "@prisma/client";

/**
 * The asset types this demo needs, as data.
 *
 * SPEC §3 requires the core to be asset-type agnostic: `Asset`, `AssetType`
 * and an extensible attribute model, with no per-type tables. So adding
 * reservoirs, wells and pump stations is an insert, not a migration — which is
 * also what makes it reversible: deleting the rows removes the types.
 *
 * Two things this file deliberately does not do:
 *
 * **Pipes are not a new type.** JVWCD's pipe inventory goes onto the existing
 * WATERLINE type, whose attributes, deterioration curves, treatment library,
 * rules and cost rates already exist. A parallel "Pipe" type would be a second
 * vocabulary for the same thing, and every screen in the app reads WATERLINE.
 *
 * **Nothing here creates an asset.** These are the definitions the importers in
 * Phase 4 write values against.
 */

type AttributeSpec = {
  code: string;
  label: string;
  dataType: AttributeDataType;
  unit?: string;
  options?: string[];
  /** Nothing is required: this is public summary data with real gaps in it,
   * and a required field would only produce rows that cannot be written. */
  help?: string;
};

type TypeSpec = {
  code: string;
  name: string;
  description: string;
  attributes: AttributeSpec[];
};

/** Held by every facility, so a row can be traced back to the source table. */
const FACILITY: AttributeSpec[] = [
  { code: "FACILITY_ID", label: "Facility ID", dataType: AttributeDataType.TEXT },
  {
    code: "ADDRESS",
    label: "Street Address",
    dataType: AttributeDataType.TEXT,
    help: "Ordinary Salt Lake County address as published. Facility coordinates themselves are GRAMA-protected and are not held here.",
  },
];

export const JVWCD_ASSET_TYPES: TypeSpec[] = [
  {
    code: "RESERVOIR",
    name: "Reservoir",
    description: "Finished-water storage: tanks and reservoirs, by capacity, construction and elevation.",
    attributes: [
      ...FACILITY,
      { code: "CAPACITY_MG", label: "Capacity", dataType: AttributeDataType.NUMBER, unit: "MG" },
      {
        code: "MATERIAL",
        label: "Material",
        dataType: AttributeDataType.ENUM,
        options: ["Concrete", "Prestressed Concrete", "Steel", "Buried Concrete", "Other", "Unknown"],
      },
      {
        code: "LAST_INSPECTED",
        label: "Last Inspected",
        dataType: AttributeDataType.DATE,
        help: "The District publishes a year, not a date, so this is 1 January of that year and is only accurate to the year. Gaps are real and are what makes the inspection interval worth reporting on.",
      },
      { code: "FLOOR_ELEV_FT", label: "Floor Elevation", dataType: AttributeDataType.NUMBER, unit: "ft" },
      { code: "OVERFLOW_ELEV_FT", label: "Overflow Elevation", dataType: AttributeDataType.NUMBER, unit: "ft" },
    ],
  },
  {
    code: "WELL",
    name: "Well",
    description: "Groundwater production wells, with design capacity, setting and what each one produced and cost to run.",
    attributes: [
      ...FACILITY,
      { code: "DESIGN_CAPACITY_CFS", label: "Design Capacity", dataType: AttributeDataType.NUMBER, unit: "cfs" },
      { code: "WELL_SETTING_LEVEL_FT", label: "Well Setting Level", dataType: AttributeDataType.NUMBER, unit: "ft" },
      {
        code: "ANNUAL_PRODUCTION_AF",
        label: "Annual Production",
        dataType: AttributeDataType.NUMBER,
        unit: "AF",
        help: "The most recent year in the source table. The year-by-year series is in Production History.",
      },
      {
        code: "ANNUAL_PRODUCTION_HISTORY",
        label: "Production History",
        dataType: AttributeDataType.TEXT,
        help: 'Year-by-year production as JSON, e.g. {"2023":812,"2024":905,"2025":774}. Text because the attribute model has no series type; the single number above is what anything sorting or ranking reads.',
      },
      { code: "TOTAL_POWER_COST", label: "Total Power Cost", dataType: AttributeDataType.NUMBER, unit: "$" },
      { code: "AVG_COST_PER_AF", label: "Average Cost per Acre-Foot", dataType: AttributeDataType.NUMBER, unit: "$/AF" },
    ],
  },
  {
    code: "BOOSTER_PUMP_STATION",
    name: "Booster Pump Station",
    description: "Pump stations that lift water between pressure zones, with capacity, lift and what pumping cost.",
    attributes: [
      ...FACILITY,
      { code: "ZONE", label: "Pressure Zone", dataType: AttributeDataType.TEXT },
      { code: "CAPACITY_CFS", label: "Capacity", dataType: AttributeDataType.NUMBER, unit: "cfs" },
      { code: "TOTAL_HP", label: "Total Horsepower", dataType: AttributeDataType.NUMBER, unit: "hp" },
      { code: "AVG_DYNAMIC_LIFT_FT", label: "Average Dynamic Lift", dataType: AttributeDataType.NUMBER, unit: "ft" },
      { code: "VOLUME_PUMPED_AF", label: "Volume Pumped", dataType: AttributeDataType.NUMBER, unit: "AF" },
      { code: "TOTAL_POWER_COST", label: "Total Power Cost", dataType: AttributeDataType.NUMBER, unit: "$" },
      { code: "AVG_COST_PER_AF", label: "Average Cost per Acre-Foot", dataType: AttributeDataType.NUMBER, unit: "$/AF" },
    ],
  },

  // Named in the brief but with no data behind them yet. The type exists so the
  // catalog matches the District's asset classes and an importer has somewhere
  // to put rows; inventing attributes before seeing a source table would only
  // mean renaming them later.
  {
    code: "VALVE",
    name: "Valve",
    description: "Isolation, control and regulating valves. No source data yet — the type is here for when there is.",
    attributes: [],
  },
  {
    code: "FIRE_HYDRANT",
    name: "Fire Hydrant",
    description: "Hydrants. No source data yet — the type is here for when there is.",
    attributes: [],
  },
  {
    code: "TREATMENT_PLANT",
    name: "Treatment Plant",
    description: "Water treatment plants. No source data yet — the type is here for when there is.",
    attributes: [],
  },
];

/**
 * Write the types and their attribute definitions, leaving anything already
 * there alone.
 *
 * Idempotent, so the seed can be re-run while the importers are being written
 * without stacking up duplicates: types match on their code, attributes on
 * (type, code).
 */
export async function ensureJvwcdAssetTypes(prisma: PrismaClient, organizationId: string) {
  const summary: Array<{ type: string; attributes: number; created: boolean }> = [];

  for (const spec of JVWCD_ASSET_TYPES) {
    const existing = await prisma.assetType.findUnique({ where: { code: spec.code }, select: { id: true } });
    const assetType = existing
      ? await prisma.assetType.update({
          where: { code: spec.code },
          data: { name: spec.name, description: spec.description },
          select: { id: true },
        })
      : await prisma.assetType.create({
          data: { code: spec.code, name: spec.name, description: spec.description, organizationId },
          select: { id: true },
        });

    let sortOrder = 0;
    for (const attribute of spec.attributes) {
      // Shaped the way the rest of the app reads it: `options` drives an ENUM
      // field's choices, `help` is shown beside the field.
      await prisma.assetAttributeDefinition.upsert({
        where: { assetTypeId_code: { assetTypeId: assetType.id, code: attribute.code } },
        update: {
          label: attribute.label,
          dataType: attribute.dataType,
          unit: attribute.unit ?? null,
          sortOrder,
          config: configOf(attribute),
        },
        create: {
          assetTypeId: assetType.id,
          code: attribute.code,
          label: attribute.label,
          dataType: attribute.dataType,
          unit: attribute.unit ?? null,
          isRequired: false,
          sortOrder,
          config: configOf(attribute),
        },
      });
      sortOrder++;
    }

    summary.push({ type: spec.code, attributes: spec.attributes.length, created: !existing });
  }

  return summary;
}

/**
 * What the pipe inventory carries that the sample network never did: the band
 * label it was published under, its valve count, its share of the system, and
 * a sentence saying whether the row is a published band or a synthesized share
 * of one.
 *
 * Added to WATERLINE rather than to a new type, because they describe the same
 * pipes every other attribute on that type describes.
 */
const WATERLINE_BAND_ATTRIBUTES: AttributeSpec[] = [
  {
    code: "DIAMETER_BAND",
    label: "Diameter Band",
    dataType: AttributeDataType.TEXT,
    help: 'As published — "<2", "3-4", "15-16". The numeric Diameter beside it is the largest in the band, which is what rules and cost rates compare.',
  },
  { code: "VALVE_COUNT", label: "Valves", dataType: AttributeDataType.NUMBER },
  {
    code: "PCT_OF_SYSTEM",
    label: "Share of System",
    dataType: AttributeDataType.NUMBER,
    unit: "%",
    help: "Only on a row that is a whole published band; a share of the system means nothing for one segment of one.",
  },
  {
    code: "SEGMENT_BASIS",
    label: "Basis",
    dataType: AttributeDataType.TEXT,
    help: "Whether this row is a diameter band as the District published it, or a synthesized share of one. Synthesized segments are illustrative and are not real alignments.",
  },
];

/**
 * JVWCD's pipe inventory is summarised by diameter band, with no material and
 * no installation year, so the two attributes the sample network required have
 * to stop being required — otherwise every imported band is a row the model
 * refuses to price.
 *
 * Material is left empty rather than filled with a guess. `curveFor` falls back
 * to a default deterioration curve for an unknown material, so a band still
 * ages; a made-up material would age it confidently and wrongly.
 */
export async function relaxWaterlineRequirements(prisma: PrismaClient) {
  const waterline = await prisma.assetType.findUnique({ where: { code: "WATERLINE" }, select: { id: true } });
  if (!waterline) return { relaxed: 0, added: 0 };

  const relaxed = await prisma.assetAttributeDefinition.updateMany({
    where: { assetTypeId: waterline.id, code: { in: ["MATERIAL"] }, isRequired: true },
    data: { isRequired: false },
  });

  const highest = await prisma.assetAttributeDefinition.aggregate({
    where: { assetTypeId: waterline.id },
    _max: { sortOrder: true },
  });
  let sortOrder = (highest._max.sortOrder ?? 0) + 1;
  for (const attribute of WATERLINE_BAND_ATTRIBUTES) {
    await prisma.assetAttributeDefinition.upsert({
      where: { assetTypeId_code: { assetTypeId: waterline.id, code: attribute.code } },
      update: { label: attribute.label, dataType: attribute.dataType, unit: attribute.unit ?? null, config: configOf(attribute) },
      create: {
        assetTypeId: waterline.id,
        code: attribute.code,
        label: attribute.label,
        dataType: attribute.dataType,
        unit: attribute.unit ?? null,
        isRequired: false,
        sortOrder: sortOrder++,
        config: configOf(attribute),
      },
    });
  }

  return { relaxed: relaxed.count, added: WATERLINE_BAND_ATTRIBUTES.length };
}

/** The `config` blob as the rest of the app reads it: `options` for an ENUM's
 * choices, `help` for the note beside the field. */
function configOf(attribute: AttributeSpec) {
  const config = {
    ...(attribute.options ? { options: attribute.options } : {}),
    ...(attribute.help ? { help: attribute.help } : {}),
  } satisfies Prisma.InputJsonObject;
  return Object.keys(config).length > 0 ? config : undefined;
}
