import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConditionBand, computeWCI , type ConditionBand } from "@/domain/waterline/condition";
import { getIndexWeights } from "@/server/condition-model";

export async function getWaterlineTemplate(organizationId: string) {
  const template = await prisma.inspectionTemplate.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId }, isActive: true },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template) throw new Error("No active inspection template configured for waterlines");
  return template;
}

export type InspectionFilters = {
  search?: string;
  inspectionType?: string;
  requiresFollowUp?: boolean;
  assetId?: string;
};

const inspectionInclude = {
  asset: { select: { id: true, assetCode: true, organizationId: true } },
  inspector: { select: { id: true, name: true } },
  results: { include: { field: true } },
  conditionMeasurements: true,
} satisfies Prisma.InspectionInclude;

export type InspectionWithDetails = Prisma.InspectionGetPayload<{ include: typeof inspectionInclude }>;

export async function listInspections(organizationId: string, filters: InspectionFilters = {}) {
  const assetWhere: Prisma.AssetWhereInput = { organizationId, deletedAt: null };
  if (filters.search) {
    assetWhere.assetCode = { contains: filters.search, mode: "insensitive" };
  }

  const where: Prisma.InspectionWhereInput = { asset: assetWhere };
  if (filters.assetId) where.assetId = filters.assetId;
  if (filters.inspectionType) where.inspectionType = filters.inspectionType;
  if (filters.requiresFollowUp) where.requiresFollowUp = true;

  return prisma.inspection.findMany({
    where,
    include: inspectionInclude,
    orderBy: { inspectionDate: "desc" },
  });
}

export async function getInspectionById(organizationId: string, id: string) {
  return prisma.inspection.findFirst({
    where: { id, asset: { organizationId, deletedAt: null } },
    include: inspectionInclude,
  });
}

export type CreateInspectionInput = {
  assetId: string;
  templateId: string;
  inspectorId: string;
  inspectionDate: Date;
  inspectionType: string;
  requiresFollowUp: boolean;
  notes?: string;
  gpsLat?: number;
  gpsLng?: number;
  fieldValues: Array<{ fieldId: string; code: string; dataType: string; value: string }>;
};

export async function createInspection(organizationId: string, input: CreateInspectionInput) {
  const asset = await prisma.asset.findFirst({ where: { id: input.assetId, organizationId, deletedAt: null } });
  if (!asset) throw new Error("Asset not found");

  const conditionModel = await prisma.conditionModel.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId } },
  });

  const results = input.fieldValues.map((f) => {
    if (f.dataType === "NUMBER") {
      return { fieldId: f.fieldId, numberValue: Number(f.value) };
    }
    return { fieldId: f.fieldId, textValue: f.value };
  });

  const numericScores: Record<string, number> = {};
  for (const f of input.fieldValues) {
    if (f.dataType === "NUMBER" && f.value !== "") numericScores[f.code] = Number(f.value);
  }
  // Score against the currently configured index, not the seed constant, so a
  // reweighted index takes effect on the very next inspection.
  const wci = computeWCI(numericScores, await getIndexWeights(organizationId));

  const inspection = await prisma.inspection.create({
    data: {
      assetId: input.assetId,
      templateId: input.templateId,
      inspectorId: input.inspectorId,
      inspectionDate: input.inspectionDate,
      inspectionType: input.inspectionType,
      requiresFollowUp: input.requiresFollowUp,
      notes: input.notes || null,
      gpsLat: input.gpsLat,
      gpsLng: input.gpsLng,
      results: { create: results },
    },
  });

  if (conditionModel && Object.keys(numericScores).length > 0) {
    await prisma.conditionMeasurement.create({
      data: {
        assetId: input.assetId,
        conditionModelId: conditionModel.id,
        inspectionId: inspection.id,
        score: wci,
        measurementDate: input.inspectionDate,
        source: "Inspection",
      },
    });
  }

  return inspection;
}

/** Stays synchronous so it can be used inside a .map() over rows; the caller
 * loads the configured bands once and passes them in. */
export function summarizeInspectionScore(inspection: InspectionWithDetails, bands: ConditionBand[]) {
  const measurement = inspection.conditionMeasurements[0];
  if (!measurement) return null;
  return { score: measurement.score, band: getConditionBand(measurement.score, bands) };
}
