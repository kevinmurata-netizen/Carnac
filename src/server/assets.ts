import { Prisma, AssetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { sameCalendarDay } from "@/lib/format";

const attributeValueInclude = {
  attributeValues: { include: { definition: true } },
  location: {
    select: {
      startLat: true,
      startLng: true,
      endLat: true,
      endLng: true,
      depth: true,
      serviceArea: true,
      pressureZone: true,
    },
  },
} satisfies Prisma.AssetInclude;

export type AssetWithAttributes = Prisma.AssetGetPayload<{ include: typeof attributeValueInclude }>;

// Flattens the extensible attribute rows into a simple { CODE: value } record
// so UI code doesn't need to know about AssetAttributeValue's storage shape.
export function flattenAttributes(asset: AssetWithAttributes): Record<string, string | number | boolean | Date | null> {
  const out: Record<string, string | number | boolean | Date | null> = {};
  for (const av of asset.attributeValues) {
    const code = av.definition.code;
    out[code] = av.textValue ?? av.numberValue ?? av.dateValue ?? av.booleanValue ?? null;
  }
  return out;
}

export type AssetFilters = {
  search?: string;
  material?: string;
  status?: AssetStatus;
  serviceArea?: string;
  minDiameter?: number;
  maxDiameter?: number;
  installedBefore?: number; // year
  installedAfter?: number; // year
  /** Restrict to these ids, e.g. the result of a saved filter. */
  assetIds?: string[];
  sort?: string;
  dir?: "asc" | "desc";
  criticality?: string;
  customerType?: string;
  pressureZone?: string;
  minCustomers?: number;
  maxCustomers?: number;
  /** Latest condition score. Segments never inspected have no score and are
   * excluded by either bound, since "worse than 40" cannot be true of a
   * segment whose condition is unknown. */
  minCondition?: number;
  maxCondition?: number;
};

export async function listAssets(organizationId: string, filters: AssetFilters = {}) {
  const where: Prisma.AssetWhereInput = {
    organizationId,
    assetType: { code: "WATERLINE" },
    deletedAt: null,
  };

  if (filters.status) where.status = filters.status;

  // An empty list means a saved filter matched nothing, which must show no
  // rows rather than being ignored as "no constraint".
  if (filters.assetIds) where.id = { in: filters.assetIds };

  if (filters.search) {
    where.OR = [
      { assetCode: { contains: filters.search, mode: "insensitive" } },
      { name: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  if (filters.installedBefore || filters.installedAfter) {
    where.installationDate = {};
    if (filters.installedAfter) where.installationDate.gte = new Date(`${filters.installedAfter}-01-01`);
    if (filters.installedBefore) where.installationDate.lte = new Date(`${filters.installedBefore}-12-31`);
  }

  if (filters.serviceArea) {
    where.location = { is: { serviceArea: filters.serviceArea } };
  }

  const attributeConditions: Prisma.AssetWhereInput[] = [];

  const textAttribute = (code: string, value?: string) => {
    if (!value) return;
    attributeConditions.push({ attributeValues: { some: { definition: { code }, textValue: value } } });
  };

  const numberAttribute = (code: string, min?: number, max?: number) => {
    if (min == null && max == null) return;
    attributeConditions.push({
      attributeValues: {
        some: { definition: { code }, numberValue: { gte: min ?? undefined, lte: max ?? undefined } },
      },
    });
  };

  textAttribute(WATERLINE_ATTRIBUTES.MATERIAL, filters.material);
  textAttribute(WATERLINE_ATTRIBUTES.CRITICALITY, filters.criticality);
  textAttribute(WATERLINE_ATTRIBUTES.CUSTOMER_TYPE, filters.customerType);
  numberAttribute(WATERLINE_ATTRIBUTES.DIAMETER, filters.minDiameter, filters.maxDiameter);
  numberAttribute(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED, filters.minCustomers, filters.maxCustomers);

  if (attributeConditions.length > 0) where.AND = attributeConditions;

  if (filters.pressureZone) {
    // Merge into the existing `is` rather than spreading the wrapper, or a
    // service-area filter set above would be replaced instead of combined.
    const existing = (where.location as { is?: object } | undefined)?.is ?? {};
    where.location = { is: { ...existing, pressureZone: filters.pressureZone } };
  }

  // Columns backed by a real column, so they sort in the query. Age is not
  // stored — it is today minus the installation date — so sorting by age is
  // exactly sorting by installation date the other way round. Segments with no
  // installation date have no age, and sort last in both directions rather
  // than bunching at the top as if they were brand new.
  // Condition is the score on the newest measurement, which Prisma cannot
  // express directly — `some` would match a segment that was poor last year
  // and is fine now. DISTINCT ON picks the latest row per asset first, so the
  // range is applied to the score that is actually current.
  if (filters.minCondition != null || filters.maxCondition != null) {
    const matching = await prisma.$queryRaw<Array<{ assetId: string }>>(Prisma.sql`
      SELECT "assetId" FROM (
        SELECT DISTINCT ON (cm."assetId") cm."assetId", cm.score
        FROM condition_measurements cm
        JOIN assets a ON a.id = cm."assetId"
        WHERE a."organizationId" = ${organizationId} AND a."deletedAt" IS NULL
        ORDER BY cm."assetId", cm."measurementDate" DESC
      ) latest
      WHERE ${filters.minCondition != null ? Prisma.sql`latest.score >= ${filters.minCondition}` : Prisma.sql`TRUE`}
        AND ${filters.maxCondition != null ? Prisma.sql`latest.score <= ${filters.maxCondition}` : Prisma.sql`TRUE`}
    `);

    const ids = matching.map((r) => r.assetId);
    // Intersect rather than overwrite: a saved filter may already have narrowed
    // this to a set of ids, and both constraints have to hold.
    const existing = (where.id as { in?: string[] } | undefined)?.in;
    where.id = { in: existing ? ids.filter((id) => existing.includes(id)) : ids };
  }

  const DB_SORTS: Record<string, (dir: "asc" | "desc") => Prisma.AssetOrderByWithRelationInput> = {
    assetCode: (dir) => ({ assetCode: dir }),
    status: (dir) => ({ status: dir }),
    installationDate: (dir) => ({ installationDate: { sort: dir, nulls: "last" } }),
    age: (dir) => ({ installationDate: { sort: dir === "asc" ? "desc" : "asc", nulls: "last" } }),
  };

  const dir = filters.dir === "desc" ? "desc" : "asc";
  const dbSort = filters.sort ? DB_SORTS[filters.sort] : undefined;
  const orderBy: Prisma.AssetOrderByWithRelationInput = dbSort ? dbSort(dir) : { assetCode: "asc" };

  const assets = await prisma.asset.findMany({ where, include: attributeValueInclude, orderBy });

  if (!filters.sort || dbSort) return assets;

  // Attribute-backed and derived columns cannot be ordered by in the query,
  // so they are sorted here. Nulls always sort last regardless of direction —
  // a column of blanks at the top is never what someone wanted.
  const valueOf = (a: (typeof assets)[number]): string | number | null => {
    switch (filters.sort) {
      case "material":
        return a.attributeValues.find((v) => v.definition.code === WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null;
      case "diameter":
        return a.attributeValues.find((v) => v.definition.code === WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null;
      case "length":
        return a.attributeValues.find((v) => v.definition.code === WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? null;
      case "customers":
        return a.attributeValues.find((v) => v.definition.code === WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null;
      case "serviceArea":
        return a.location?.serviceArea ?? null;
      default:
        return null;
    }
  };

  return [...assets].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return dir === "desc" ? -cmp : cmp;
  });
}

export async function getAssetById(organizationId: string, id: string) {
  return prisma.asset.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: attributeValueInclude,
  });
}

/**
 * Saves edits made on an asset's detail page.
 *
 * Only the fields the form actually sends are written, so a form rendered with
 * one card unlocked cannot blank out the cards it never showed. Attribute
 * values are keyed by definition code and coerced according to the definition's
 * dataType — the form has no say in how a value is stored.
 */
export type AssetEdit = {
  name?: string | null;
  status?: AssetStatus;
  ownerDepartment?: string | null;
  installationDate?: Date | null;
  expectedUsefulLife?: number | null;
  /** Attribute code → raw string from the form. "" clears the value. */
  attributes?: Record<string, string>;
  location?: { serviceArea?: string | null; pressureZone?: string | null; depth?: number | null };
};

export async function updateAsset(
  organizationId: string,
  id: string,
  edit: AssetEdit,
  updatedBy?: string | null
) {
  const asset = await prisma.asset.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: { id: true, assetTypeId: true, installationDate: true },
  });
  if (!asset) throw new Error("That segment no longer exists");

  const data: Prisma.AssetUpdateInput = { updatedBy: updatedBy ?? null };
  if (edit.name !== undefined) data.name = edit.name;
  if (edit.status !== undefined) data.status = edit.status;
  if (edit.ownerDepartment !== undefined) data.ownerDepartment = edit.ownerDepartment;
  // A date input carries no time of day, so re-submitting the same day must
  // not truncate the recorded instant to midnight.
  if (
    edit.installationDate !== undefined &&
    !(edit.installationDate && asset.installationDate && sameCalendarDay(edit.installationDate, asset.installationDate))
  ) {
    data.installationDate = edit.installationDate;
  }
  if (edit.expectedUsefulLife !== undefined) data.expectedUsefulLife = edit.expectedUsefulLife;

  const writes: Prisma.PrismaPromise<unknown>[] = [prisma.asset.update({ where: { id }, data })];

  if (edit.attributes && Object.keys(edit.attributes).length > 0) {
    const definitions = await prisma.assetAttributeDefinition.findMany({
      where: { assetTypeId: asset.assetTypeId, code: { in: Object.keys(edit.attributes) } },
    });

    for (const definition of definitions) {
      const raw = edit.attributes[definition.code].trim();
      const value = coerceAttribute(definition.dataType, raw);

      if (raw === "") {
        if (definition.isRequired) throw new Error(`${definition.label} is required`);
        // Clearing removes the row rather than storing four nulls, so the
        // attribute reads as genuinely unset everywhere it is loaded.
        writes.push(
          prisma.assetAttributeValue.deleteMany({ where: { assetId: id, definitionId: definition.id } })
        );
        continue;
      }
      if (value === null) throw new Error(`"${raw}" is not a valid ${definition.label}`);

      // An ENUM's allowed values are configuration, so they are enforced here
      // rather than trusted to whatever the form happened to render.
      if (definition.dataType === "ENUM") {
        const options = (definition.config as { options?: string[] } | null)?.options;
        if (options?.length && !options.includes(raw)) {
          throw new Error(`"${raw}" is not one of the configured ${definition.label} values`);
        }
      }

      writes.push(
        prisma.assetAttributeValue.upsert({
          where: { assetId_definitionId: { assetId: id, definitionId: definition.id } },
          create: { assetId: id, definitionId: definition.id, ...value },
          update: { textValue: null, numberValue: null, dateValue: null, booleanValue: null, ...value },
        })
      );
    }
  }

  if (edit.location) {
    const { serviceArea, pressureZone, depth } = edit.location;
    const locationData: Prisma.AssetLocationUpdateInput = {};
    if (serviceArea !== undefined) locationData.serviceArea = serviceArea;
    if (pressureZone !== undefined) locationData.pressureZone = pressureZone;
    if (depth !== undefined) locationData.depth = depth;

    // Only ever an update: AssetLocation carries a non-null PostGIS geometry
    // that this form has no way to supply, so a segment with no location row
    // keeps having none rather than failing the save.
    if (Object.keys(locationData).length > 0) {
      writes.push(prisma.assetLocation.updateMany({ where: { assetId: id }, data: locationData }));
    }
  }

  await prisma.$transaction(writes);
}

type AttributeWrite = Pick<
  Prisma.AssetAttributeValueCreateInput,
  "textValue" | "numberValue" | "dateValue" | "booleanValue"
>;

/** null means the string is not valid for that type, which is an error rather
 * than a silent no-op. */
function coerceAttribute(dataType: string, raw: string): AttributeWrite | null {
  switch (dataType) {
    case "NUMBER": {
      const n = Number(raw);
      return Number.isFinite(n) ? { numberValue: n } : null;
    }
    case "DATE": {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : { dateValue: d };
    }
    case "BOOLEAN":
      return { booleanValue: raw === "true" || raw === "on" || raw === "Yes" };
    default:
      return { textValue: raw };
  }
}

export async function listAssetOptions(organizationId: string): Promise<Array<{ id: string; assetCode: string }>> {
  return prisma.asset.findMany({
    where: { organizationId, assetType: { code: "WATERLINE" }, deletedAt: null },
    select: { id: true, assetCode: true },
    orderBy: { assetCode: "asc" },
  });
}

export async function listServiceAreas(organizationId: string): Promise<string[]> {
  const rows = await prisma.assetLocation.findMany({
    where: { asset: { organizationId, deletedAt: null } },
    select: { serviceArea: true },
    distinct: ["serviceArea"],
  });
  return rows.map((r) => r.serviceArea).filter((v): v is string => !!v).sort();
}

export async function listMaterials(organizationId: string): Promise<string[]> {
  const rows = await prisma.assetAttributeValue.findMany({
    where: {
      definition: { code: WATERLINE_ATTRIBUTES.MATERIAL },
      asset: { organizationId, deletedAt: null },
    },
    select: { textValue: true },
    distinct: ["textValue"],
  });
  return rows.map((r) => r.textValue).filter((v): v is string => !!v).sort();
}

export type NetworkSummary = {
  totalSegments: number;
  totalLengthFt: number;
  byStatus: Array<{ status: AssetStatus; count: number }>;
  byMaterial: Array<{ material: string; count: number; lengthFt: number }>;
  byDecade: Array<{ decade: string; count: number }>;
};

export async function getNetworkSummary(organizationId: string): Promise<NetworkSummary> {
  const assets = await prisma.asset.findMany({
    where: { organizationId, assetType: { code: "WATERLINE" }, deletedAt: null },
    select: {
      status: true,
      installationDate: true,
      attributeValues: {
        where: { definition: { code: { in: [WATERLINE_ATTRIBUTES.MATERIAL, WATERLINE_ATTRIBUTES.LENGTH] } } },
        include: { definition: true },
      },
    },
  });

  let totalLengthFt = 0;
  const byStatusMap = new Map<AssetStatus, number>();
  const byMaterialMap = new Map<string, { count: number; lengthFt: number }>();
  const byDecadeMap = new Map<string, number>();

  for (const asset of assets) {
    byStatusMap.set(asset.status, (byStatusMap.get(asset.status) ?? 0) + 1);

    const material = asset.attributeValues.find((a) => a.definition.code === WATERLINE_ATTRIBUTES.MATERIAL)?.textValue;
    const length = asset.attributeValues.find((a) => a.definition.code === WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? 0;
    totalLengthFt += length;

    if (material) {
      const entry = byMaterialMap.get(material) ?? { count: 0, lengthFt: 0 };
      entry.count += 1;
      entry.lengthFt += length;
      byMaterialMap.set(material, entry);
    }

    if (asset.installationDate) {
      const decade = `${Math.floor(asset.installationDate.getFullYear() / 10) * 10}s`;
      byDecadeMap.set(decade, (byDecadeMap.get(decade) ?? 0) + 1);
    }
  }

  return {
    totalSegments: assets.length,
    totalLengthFt,
    byStatus: [...byStatusMap.entries()].map(([status, count]) => ({ status, count })),
    byMaterial: [...byMaterialMap.entries()]
      .map(([material, v]) => ({ material, ...v }))
      .sort((a, b) => b.count - a.count),
    byDecade: [...byDecadeMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([decade, count]) => ({ decade, count })),
  };
}

/** Distinct values for a text attribute, for filter dropdowns. */
async function distinctAttribute(organizationId: string, code: string): Promise<string[]> {
  const rows = await prisma.assetAttributeValue.findMany({
    where: { definition: { code }, asset: { organizationId, deletedAt: null }, textValue: { not: null } },
    select: { textValue: true },
    distinct: ["textValue"],
  });
  return rows.map((r) => r.textValue!).filter(Boolean).sort();
}

export async function listCriticalities(organizationId: string) {
  return distinctAttribute(organizationId, WATERLINE_ATTRIBUTES.CRITICALITY);
}

export async function listCustomerTypes(organizationId: string) {
  return distinctAttribute(organizationId, WATERLINE_ATTRIBUTES.CUSTOMER_TYPE);
}

export async function listPressureZones(organizationId: string): Promise<string[]> {
  const rows = await prisma.assetLocation.findMany({
    where: { asset: { organizationId, deletedAt: null }, pressureZone: { not: null } },
    select: { pressureZone: true },
    distinct: ["pressureZone"],
  });
  return rows.map((r) => r.pressureZone!).filter(Boolean).sort();
}
