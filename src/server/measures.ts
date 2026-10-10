import { prisma } from "@/lib/prisma";
import { MEASURE_ROLES, type MeasureCodes, type MeasureRole } from "@/lib/measure-roles";

export { MEASURE_ROLES, type MeasureCodes, type MeasureRole };

/**
 * Measures: the few facts about an asset the engine itself reads, as opposed
 * to the many an inventory merely records.
 *
 * Which attribute holds each one is set per asset type (AssetType.measures),
 * not written into the code. A water main's material and diameter are a
 * pole's class and height; a transformer may have no "customers served" at
 * all. A role with no attribute reads as unknown, which every reader already
 * handles — the same as an asset with the field left blank.
 */

/** One asset's measures, read through its type's codes. */
export type Measures = {
  material: string | null;
  diameter: number | null;
  length: number | null;
  customersServed: number | null;
  criticality: string | null;
  customerType: string | null;
};

const ROLE_KEYS = new Set<string>(MEASURE_ROLES.map((r) => r.key));

export function parseMeasureCodes(value: unknown): MeasureCodes {
  const out: MeasureCodes = {};
  if (value && typeof value === "object") {
    for (const [role, code] of Object.entries(value as Record<string, unknown>)) {
      if (ROLE_KEYS.has(role) && typeof code === "string" && code) out[role as MeasureRole] = code;
    }
  }
  return out;
}

type AttributeValueRow = {
  definition: { code: string };
  textValue: string | null;
  numberValue: number | null;
};

export function readMeasures(values: AttributeValueRow[], codes: MeasureCodes): Measures {
  const find = (role: MeasureRole) => {
    const code = codes[role];
    return code ? values.find((v) => v.definition.code === code) : undefined;
  };
  return {
    material: find("material")?.textValue ?? null,
    diameter: find("diameter")?.numberValue ?? null,
    length: find("length")?.numberValue ?? null,
    customersServed: find("customersServed")?.numberValue ?? null,
    criticality: find("criticality")?.textValue ?? null,
    customerType: find("customerType")?.textValue ?? null,
  };
}

/** Every asset type's measure codes in this organization, by type id. */
export async function getMeasureCodes(organizationId: string): Promise<(assetTypeId: string) => MeasureCodes> {
  const types = await prisma.assetType.findMany({
    where: { organizationId },
    select: { id: true, measures: true },
  });
  const byType = new Map(types.map((t) => [t.id, parseMeasureCodes(t.measures)]));
  return (assetTypeId) => byType.get(assetTypeId) ?? {};
}

/** An attribute-definition filter matching one role on every asset type
 * that has it. Matches nothing when no type has the role. */
export type MeasureDefinitionFilter = { OR: Array<{ assetTypeId: string; code: string }> };

/**
 * A definition filter for each role, across this organization's asset types —
 * for queries over values ("every material in the network", "segments over
 * 12 inches") rather than over one asset at a time.
 */
export async function getMeasureDefinitionFilters(
  organizationId: string
): Promise<Record<MeasureRole, MeasureDefinitionFilter>> {
  const types = await prisma.assetType.findMany({
    where: { organizationId },
    select: { id: true, measures: true },
  });
  const out = {} as Record<MeasureRole, MeasureDefinitionFilter>;
  for (const r of MEASURE_ROLES) out[r.key] = { OR: [] };
  for (const t of types) {
    for (const [role, code] of Object.entries(parseMeasureCodes(t.measures))) {
      out[role as MeasureRole].OR.push({ assetTypeId: t.id, code });
    }
  }
  return out;
}
