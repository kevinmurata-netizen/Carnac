import { prisma } from "@/lib/prisma";
import { getConditionBand } from "@/domain/waterline/condition";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { getConditionBandsByModel } from "@/server/settings";
import { MODELLED } from "@/server/modelled-asset-type";

/**
 * Each modelled asset type's condition index, and the bands to grade a score
 * filed under it. Condition is read across every modelled type at once, each
 * measurement graded by its own type's bands.
 */
async function getIndexModels(organizationId: string) {
  const bandsByModel = await getConditionBandsByModel(organizationId);
  if (bandsByModel.size === 0) throw new Error("No condition index is configured for this organization");
  return {
    ids: [...bandsByModel.keys()],
    bandsOf: (modelId: string) => bandsByModel.get(modelId)!,
  };
}

export type AssetCondition = {
  score: number;
  band: ReturnType<typeof getConditionBand>;
  measurementDate: Date;
};

/** Latest condition measurement per asset, using Postgres DISTINCT ON semantics
 * via Prisma's distinct+orderBy combination. */
export async function getLatestConditionByAsset(organizationId: string): Promise<Map<string, AssetCondition>> {
  const index = await getIndexModels(organizationId);
  const rows = await prisma.conditionMeasurement.findMany({
    where: { conditionModelId: { in: index.ids }, assetComponentId: null, asset: { organizationId, deletedAt: null } },
    orderBy: [{ assetId: "asc" }, { measurementDate: "desc" }],
    distinct: ["assetId"],
    select: { assetId: true, score: true, measurementDate: true, conditionModelId: true },
  });

  const map = new Map<string, AssetCondition>();
  for (const row of rows) {
    map.set(row.assetId, {
      score: row.score,
      band: getConditionBand(row.score, index.bandsOf(row.conditionModelId)),
      measurementDate: row.measurementDate,
    });
  }
  return map;
}

export async function getConditionHistoryForAsset(organizationId: string, assetId: string) {
  const index = await getIndexModels(organizationId);
  const rows = await prisma.conditionMeasurement.findMany({
    where: { conditionModelId: { in: index.ids }, assetId, assetComponentId: null, asset: { organizationId } },
    orderBy: { measurementDate: "asc" },
  });
  return rows.map((r) => ({ ...r, band: getConditionBand(r.score, index.bandsOf(r.conditionModelId)) }));
}

export type ConditionSummary = {
  totalAssets: number;
  inspectedAssets: number;
  averageScore: number | null;
  byBand: Array<{ label: string; count: number; color: string }>;
  byMaterial: Array<{ material: string; averageScore: number; count: number }>;
};

export async function getConditionSummary(organizationId: string): Promise<ConditionSummary> {
  const latest = await getLatestConditionByAsset(organizationId);

  const totalAssets = await prisma.asset.count({
    where: { organizationId, assetType: MODELLED, deletedAt: null },
  });

  const byBandMap = new Map<string, { count: number; color: string }>();
  let sum = 0;
  for (const { score, band } of latest.values()) {
    sum += score;
    const entry = byBandMap.get(band.label) ?? { count: 0, color: band.color };
    entry.count += 1;
    byBandMap.set(band.label, entry);
  }

  const materialRows = await prisma.assetAttributeValue.findMany({
    where: {
      definition: { code: WATERLINE_ATTRIBUTES.MATERIAL },
      asset: { organizationId, deletedAt: null },
    },
    select: { assetId: true, textValue: true },
  });
  const materialByAsset = new Map(materialRows.map((r) => [r.assetId, r.textValue]));

  const byMaterialAgg = new Map<string, { sum: number; count: number }>();
  for (const [assetId, condition] of latest.entries()) {
    const material = materialByAsset.get(assetId);
    if (!material) continue;
    const entry = byMaterialAgg.get(material) ?? { sum: 0, count: 0 };
    entry.sum += condition.score;
    entry.count += 1;
    byMaterialAgg.set(material, entry);
  }

  return {
    totalAssets,
    inspectedAssets: latest.size,
    averageScore: latest.size > 0 ? Math.round((sum / latest.size) * 10) / 10 : null,
    byBand: [...byBandMap.entries()].map(([label, v]) => ({ label, ...v })),
    byMaterial: [...byMaterialAgg.entries()]
      .map(([material, v]) => ({ material, averageScore: Math.round((v.sum / v.count) * 10) / 10, count: v.count }))
      .sort((a, b) => a.averageScore - b.averageScore),
  };
}

export async function getWorstConditionAssets(organizationId: string, limit = 10) {
  const index = await getIndexModels(organizationId);
  const rows = await prisma.conditionMeasurement.findMany({
    where: { conditionModelId: { in: index.ids }, assetComponentId: null, asset: { organizationId, deletedAt: null } },
    orderBy: [{ assetId: "asc" }, { measurementDate: "desc" }],
    distinct: ["assetId"],
    include: { asset: { select: { id: true, assetCode: true, status: true } } },
  });

  return rows
    .map((r) => ({
      asset: r.asset,
      score: r.score,
      band: getConditionBand(r.score, index.bandsOf(r.conditionModelId)),
      measurementDate: r.measurementDate,
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}
