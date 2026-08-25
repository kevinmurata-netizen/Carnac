import { Prisma, AssetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";

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
  criticality?: string;
  customerType?: string;
  pressureZone?: string;
  minCustomers?: number;
  maxCustomers?: number;
};

export async function listAssets(organizationId: string, filters: AssetFilters = {}) {
  const where: Prisma.AssetWhereInput = {
    organizationId,
    assetType: { code: "WATERLINE" },
    deletedAt: null,
  };

  if (filters.status) where.status = filters.status;

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

  const assets = await prisma.asset.findMany({
    where,
    include: attributeValueInclude,
    orderBy: { assetCode: "asc" },
  });

  return assets;
}

export async function getAssetById(organizationId: string, id: string) {
  return prisma.asset.findFirst({
    where: { id, organizationId, deletedAt: null },
    include: attributeValueInclude,
  });
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
