import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { GENERIC_MEASURE_LABELS, measureLabel, type MeasureLabel, type MeasureLabels } from "@/lib/measure-labels";
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

/**
 * What the screens call an asset's size and length, from the attributes that
 * hold them: one asset type's (an asset's page), several read together, or,
 * with none named, every modelled type's — the network-wide screens. Where
 * the types disagree, or a type has no such attribute, the role's own name
 * stands, with no unit. Cached per request.
 */
export const getMeasureLabels = cache(
  async (organizationId: string, assetTypeIds?: string | readonly string[] | null): Promise<MeasureLabels> => {
    const ids = assetTypeIds == null ? [] : typeof assetTypeIds === "string" ? [assetTypeIds] : [...assetTypeIds];
    const select = { measures: true, attributeDefinitions: { select: { code: true, label: true, unit: true } } } as const;
    let types = ids.length > 0 ? await prisma.assetType.findMany({ where: { organizationId, id: { in: ids } }, select }) : [];
    // A type that measures neither (a facility) reads in the network's words.
    const measuring = (t: (typeof types)[number]) => {
      const codes = parseMeasureCodes(t.measures);
      return !!codes.diameter || !!codes.length;
    };
    if (!types.some(measuring)) {
      types = await prisma.assetType.findMany({ where: { organizationId, isModelled: true }, select });
    }
    const labelFor = (role: "diameter" | "length"): MeasureLabel => {
      const found = types
        .map((t) => {
          const code = parseMeasureCodes(t.measures)[role];
          const attribute = code ? t.attributeDefinitions.find((d) => d.code === code) : undefined;
          return attribute ? measureLabel(attribute.label, attribute.unit) : null;
        })
        .filter((l): l is MeasureLabel => !!l);
      const [first] = found;
      return first && found.every((l) => l.heading === first.heading) ? first : GENERIC_MEASURE_LABELS[role];
    };
    return { diameter: labelFor("diameter"), length: labelFor("length") };
  }
);

/** What the factor editor shows for each measure on one asset type. */
export type MeasureInfo = {
  role: MeasureRole;
  label: string;
  kind: "text" | "number";
  /** The attribute holding it on this type, or null where none is set. */
  attributeLabel: string | null;
  unit: string | null;
  /** For a word measure, the values recorded on this type's assets — what a
   * rating table has to cover. */
  values: string[];
};

export async function getMeasureInfo(organizationId: string, assetTypeId: string): Promise<MeasureInfo[]> {
  const type = await prisma.assetType.findFirst({
    where: { id: assetTypeId, organizationId },
    select: { measures: true, attributeDefinitions: { select: { id: true, code: true, label: true, unit: true } } },
  });
  const codes = parseMeasureCodes(type?.measures);
  return Promise.all(
    MEASURE_ROLES.map(async (role) => {
      const attribute = type?.attributeDefinitions.find((d) => d.code === codes[role.key]) ?? null;
      const values =
        attribute && role.kind === "text"
          ? (
              await prisma.assetAttributeValue.findMany({
                where: { definitionId: attribute.id, textValue: { not: null }, asset: { deletedAt: null } },
                select: { textValue: true },
                distinct: ["textValue"],
                take: 60,
              })
            )
              .map((v) => v.textValue!)
              .sort()
          : [];
      return {
        role: role.key,
        label: role.label,
        kind: role.kind,
        attributeLabel: attribute?.label ?? null,
        unit: attribute?.unit ?? null,
        values,
      };
    })
  );
}
