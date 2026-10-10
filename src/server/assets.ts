import { Prisma, AssetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMeasureCodes, getMeasureDefinitionFilters, readMeasures, type MeasureRole } from "@/server/measures";
import { sameCalendarDay } from "@/lib/format";
import { MODELLED } from "@/server/modelled-asset-type";

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
    assetType: MODELLED,
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

  // Each measure's attribute on whichever asset types have it, so a filter on
  // material means each type's own material field.
  const definitions = await getMeasureDefinitionFilters(organizationId);

  const textAttribute = (role: MeasureRole, value?: string) => {
    if (!value) return;
    attributeConditions.push({ attributeValues: { some: { definition: definitions[role], textValue: value } } });
  };

  const numberAttribute = (role: MeasureRole, min?: number, max?: number) => {
    if (min == null && max == null) return;
    attributeConditions.push({
      attributeValues: {
        some: { definition: definitions[role], numberValue: { gte: min ?? undefined, lte: max ?? undefined } },
      },
    });
  };

  textAttribute("material", filters.material);
  textAttribute("criticality", filters.criticality);
  textAttribute("customerType", filters.customerType);
  numberAttribute("diameter", filters.minDiameter, filters.maxDiameter);
  numberAttribute("customersServed", filters.minCustomers, filters.maxCustomers);

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
        WHERE a."organizationId" = ${organizationId} AND a."deletedAt" IS NULL AND cm."assetComponentId" IS NULL
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
  const measuresOf = await getMeasureCodes(organizationId);
  const valueOf = (a: (typeof assets)[number]): string | number | null => {
    const m = () => readMeasures(a.attributeValues, measuresOf(a.assetTypeId));
    switch (filters.sort) {
      case "material":
        return m().material;
      case "diameter":
        return m().diameter;
      case "length":
        return m().length;
      case "customers":
        return m().customersServed;
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
    // The type comes with it so the page can say what it is looking at. The
    // header called everything a waterline, which a reservoir is not.
    include: { ...attributeValueInclude, assetType: { select: { code: true, name: true } } },
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

/**
 * What the New asset form needs for one type: the type, its attributes, the
 * components it is made of, and the service areas and pressure zones already
 * in use, offered so a new facility files under an existing name rather than a
 * near-miss spelling of one.
 */
export async function getNewAssetForm(organizationId: string, typeCode: string) {
  const type = await prisma.assetType.findFirst({
    where: { organizationId, code: typeCode },
    select: {
      id: true,
      code: true,
      name: true,
      isModelled: true,
      attributeDefinitions: { orderBy: { sortOrder: "asc" } },
      componentTypes: {
        orderBy: { sortOrder: "asc" },
        include: { componentType: { select: { id: true, name: true, description: true } } },
      },
    },
  });
  if (!type) return null;

  const [areas, zones] = await Promise.all([
    prisma.assetLocation.findMany({
      where: { asset: { organizationId, deletedAt: null }, serviceArea: { not: null } },
      select: { serviceArea: true },
      distinct: ["serviceArea"],
    }),
    listPressureZones(organizationId),
  ]);

  return {
    type: { id: type.id, code: type.code, name: type.name, isModelled: type.isModelled },
    attributes: type.attributeDefinitions.map((d) => ({
      code: d.code,
      label: d.label,
      dataType: d.dataType,
      unit: d.unit,
      isRequired: d.isRequired,
      options: ((d.config as { options?: string[] } | null)?.options ?? []) as string[],
      help: ((d.config as { help?: string } | null)?.help ?? null) as string | null,
    })),
    components: type.componentTypes.map((l) => ({
      id: l.componentType.id,
      name: l.componentType.name,
      description: l.componentType.description,
    })),
    serviceAreas: areas.map((a) => a.serviceArea!).sort(),
    pressureZones: zones,
  };
}

export type NewAsset = {
  typeCode: string;
  assetCode: string;
  name: string | null;
  status: AssetStatus;
  ownerDepartment: string | null;
  installationDate: Date | null;
  expectedUsefulLife: number | null;
  /** Attribute code → raw string from the form. Blank means not recorded. */
  attributes: Record<string, string>;
  location: { lat: number; lng: number; serviceArea: string | null; pressureZone: string | null } | null;
  /** The component types this asset actually has — not always all of its type's. */
  componentTypeIds: string[];
};

/**
 * A new asset of a type other than the modelled one, entered by hand.
 *
 * The modelled type's assets are refused: each is a line segment with two
 * ends, a length and a place in the network, which is what the GIS import
 * supplies and a form cannot. A facility stands at one point, which a form can
 * take. (Until asset types say whether they are lines or points, the modelled
 * type is taken to be the line network.)
 */
export async function createAsset(organizationId: string, input: NewAsset, createdBy?: string | null) {
  const type = await prisma.assetType.findFirst({
    where: { organizationId, code: input.typeCode },
    include: { attributeDefinitions: true, componentTypes: { select: { componentTypeId: true } } },
  });
  if (!type) throw new Error("Asset type not found");
  if (type.isModelled) {
    throw new Error(`${type.name} assets come in through Data Import, which brings their geometry with them`);
  }

  const assetCode = input.assetCode.trim();
  if (!assetCode) throw new Error("An asset ID is required");
  const clash = await prisma.asset.findFirst({ where: { organizationId, assetCode }, select: { deletedAt: true } });
  if (clash) {
    throw new Error(
      clash.deletedAt
        ? `${assetCode} belonged to an asset that was removed — choose another ID`
        : `There is already an asset ${assetCode}`
    );
  }

  const values: Array<{ definitionId: string } & AttributeWrite> = [];
  for (const definition of type.attributeDefinitions) {
    const raw = (input.attributes[definition.code] ?? "").trim();
    if (raw === "") {
      if (definition.isRequired) throw new Error(`${definition.label} is required`);
      continue;
    }
    const value = coerceAttribute(definition.dataType, raw);
    if (value === null) throw new Error(`"${raw}" is not a valid ${definition.label}`);
    if (definition.dataType === "ENUM") {
      const options = (definition.config as { options?: string[] } | null)?.options;
      if (options?.length && !options.includes(raw)) {
        throw new Error(`"${raw}" is not one of the configured ${definition.label} values`);
      }
    }
    values.push({ definitionId: definition.id, ...value });
  }

  if (input.location) {
    const { lat, lng } = input.location;
    if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
      throw new Error("That position is not a latitude and longitude");
    }
  }

  const allowed = new Set(type.componentTypes.map((c) => c.componentTypeId));
  const componentTypeIds = [...new Set(input.componentTypeIds)];
  if (componentTypeIds.some((id) => !allowed.has(id))) {
    throw new Error(`A chosen component is not one ${type.name} is made of`);
  }

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        organizationId,
        assetTypeId: type.id,
        assetCode,
        name: input.name?.trim() || null,
        status: input.status,
        ownerDepartment: input.ownerDepartment?.trim() || null,
        installationDate: input.installationDate,
        expectedUsefulLife: input.expectedUsefulLife,
        createdBy: createdBy ?? null,
        attributeValues: { create: values },
        // Components start unscored and undated; what they are made of and
        // when they went in is recorded on the asset's page, and their
        // condition comes from inspection.
        components: { create: componentTypeIds.map((componentTypeId) => ({ componentTypeId })) },
      },
      select: { id: true },
    });

    // The geometry column is PostGIS, which Prisma can't write, so the one
    // row that needs it is written directly.
    if (input.location) {
      const { lat, lng, serviceArea, pressureZone } = input.location;
      await tx.$executeRaw`
        INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
        VALUES (${`loc_${asset.id}`}, ${asset.id}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${lat}, ${lng},
                ${serviceArea?.trim() || null}, ${pressureZone?.trim() || null})`;
    }
    return asset;
  });
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

/**
 * Everything that can be inspected, grouped by kind.
 *
 * Every type, not only waterlines: a reservoir with an inspection form is as
 * inspectable as a pipe, and the picker that could only offer pipes was the
 * reason its form could not be reached. The name comes along because a
 * facility is known by it — "RSV-01" alone is not how anyone refers to the
 * Riverside Reservoir.
 */
export async function listAssetOptions(
  organizationId: string
): Promise<Array<{ id: string; assetCode: string; name: string | null; typeCode: string; typeName: string }>> {
  const assets = await prisma.asset.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, assetCode: true, name: true, assetType: { select: { code: true, name: true } } },
    orderBy: [{ assetType: { name: "asc" } }, { assetCode: "asc" }],
  });
  return assets.map((a) => ({
    id: a.id,
    assetCode: a.assetCode,
    name: a.name,
    typeCode: a.assetType.code,
    typeName: a.assetType.name,
  }));
}

// These feed the waterline grid's filters, so they are scoped to waterlines.
// Without that, a reservoir built of concrete puts "Concrete" in the pipe
// material list and a geocoded well puts its city in the service areas —
// filters offering values no pipe can have.
export async function listServiceAreas(organizationId: string): Promise<string[]> {
  const rows = await prisma.assetLocation.findMany({
    where: { asset: { organizationId, deletedAt: null, assetType: MODELLED } },
    select: { serviceArea: true },
    distinct: ["serviceArea"],
  });
  return rows.map((r) => r.serviceArea).filter((v): v is string => !!v).sort();
}

export async function listMaterials(organizationId: string): Promise<string[]> {
  const { material } = await getMeasureDefinitionFilters(organizationId);
  const rows = await prisma.assetAttributeValue.findMany({
    where: {
      definition: { ...material, assetType: MODELLED },
      asset: { organizationId, deletedAt: null },
    },
    select: { textValue: true },
    distinct: ["textValue"],
  });
  return rows.map((r) => r.textValue).filter((v): v is string => !!v).sort();
}

/**
 * Every asset type this organization holds, with how many assets each has.
 *
 * The inventory screen is built around waterlines and always will be — that is
 * what the model plans and what most of the app is about. But an organization
 * that also holds reservoirs, wells and pump stations should be able to look
 * at them, and this is what lets the page offer the choice.
 */
export async function listAssetTypes(organizationId: string) {
  const types = await prisma.assetType.findMany({
    where: { organizationId },
    select: { code: true, name: true, description: true, isModelled: true, _count: { select: { assets: true } } },
    orderBy: { name: "asc" },
  });
  return types.map((t) => ({
    code: t.code,
    name: t.name,
    description: t.description,
    isModelled: t.isModelled,
    count: t._count.assets,
  }));
}

export type TypedAssetList = {
  type: { code: string; name: string; description: string | null };
  /** The type's own attributes, in the order it defines them — the columns a
   * reservoir or a well should be read in, rather than a pipe's. */
  columns: Array<{ code: string; label: string; unit: string | null }>;
  rows: Array<{
    id: string;
    assetCode: string;
    name: string | null;
    status: AssetStatus;
    installationDate: Date | null;
    attributes: Record<string, string | number | boolean | Date | null>;
  }>;
};

/**
 * Assets of one type, with that type's own attributes as the columns.
 *
 * Deliberately plain: no filters, no sorting, no saved views. The waterline
 * grid has all of that because waterlines are what this app plans; a facility
 * list is here so the data can be seen and checked, and pretending otherwise
 * would mean building six grids nobody asked for.
 */
export async function listTypedAssets(organizationId: string, code: string): Promise<TypedAssetList | null> {
  const type = await prisma.assetType.findFirst({
    where: { code, organizationId },
    select: {
      code: true,
      name: true,
      description: true,
      attributeDefinitions: { select: { code: true, label: true, unit: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!type) return null;

  const assets = await prisma.asset.findMany({
    where: { organizationId, assetType: { code }, deletedAt: null },
    include: attributeValueInclude,
    orderBy: { assetCode: "asc" },
  });

  return {
    type: { code: type.code, name: type.name, description: type.description },
    // Three attributes are left out because the table already shows them:
    // the facility id is the asset code, the address is the name, and the
    // location basis is a sentence rather than a value.
    columns: type.attributeDefinitions.filter(
      (d) => !["LOCATION_BASIS", "FACILITY_ID", "ADDRESS"].includes(d.code)
    ),
    rows: assets.map((a) => ({
      id: a.id,
      assetCode: a.assetCode,
      name: a.name,
      status: a.status,
      installationDate: a.installationDate,
      attributes: flattenAttributes(a),
    })),
  };
}

export type NetworkSummary = {
  totalSegments: number;
  totalLengthFt: number;
  byStatus: Array<{ status: AssetStatus; count: number }>;
  byMaterial: Array<{ material: string; count: number; lengthFt: number }>;
  byDecade: Array<{ decade: string; count: number }>;
};

export async function getNetworkSummary(organizationId: string): Promise<NetworkSummary> {
  const [definitions, measuresOf] = await Promise.all([
    getMeasureDefinitionFilters(organizationId),
    getMeasureCodes(organizationId),
  ]);
  const assets = await prisma.asset.findMany({
    where: { organizationId, assetType: MODELLED, deletedAt: null },
    select: {
      status: true,
      installationDate: true,
      assetTypeId: true,
      attributeValues: {
        where: { definition: { OR: [...definitions.material.OR, ...definitions.length.OR] } },
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

    const m = readMeasures(asset.attributeValues, measuresOf(asset.assetTypeId));
    const material = m.material;
    const length = m.length ?? 0;
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

/** Distinct values for a text measure, for filter dropdowns. */
async function distinctAttribute(organizationId: string, role: MeasureRole): Promise<string[]> {
  const definition = (await getMeasureDefinitionFilters(organizationId))[role];
  const rows = await prisma.assetAttributeValue.findMany({
    where: { definition, asset: { organizationId, deletedAt: null }, textValue: { not: null } },
    select: { textValue: true },
    distinct: ["textValue"],
  });
  return rows.map((r) => r.textValue!).filter(Boolean).sort();
}

export async function listCriticalities(organizationId: string) {
  return distinctAttribute(organizationId, "criticality");
}

export async function listCustomerTypes(organizationId: string) {
  return distinctAttribute(organizationId, "customerType");
}

export async function listPressureZones(organizationId: string): Promise<string[]> {
  const rows = await prisma.assetLocation.findMany({
    where: { asset: { organizationId, deletedAt: null }, pressureZone: { not: null } },
    select: { pressureZone: true },
    distinct: ["pressureZone"],
  });
  return rows.map((r) => r.pressureZone!).filter(Boolean).sort();
}
