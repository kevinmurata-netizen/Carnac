import { prisma } from "@/lib/prisma";
import { WCI_BANDS, type ConditionBand } from "@/domain/waterline/condition";
import { POF_WEIGHTS, COF_WEIGHTS, type PofWeightMap, type CofWeightMap } from "@/domain/waterline/risk";
import { MATERIAL_CURVES, DEFAULT_CURVE, type CurveParams } from "@/domain/waterline/deterioration";

/**
 * Settings are the modelling configuration behind every number the system
 * produces: condition bands, risk weights, deterioration curves, the asset
 * classes themselves, and failure reference data.
 *
 * The important property of this module is that the LOADERS here are what the
 * app actually reads at runtime. The domain constants remain as the seed and
 * as a fallback for a fresh install, but once a row exists the database wins —
 * otherwise these screens would be editors over values nothing consults.
 */

async function requireAssetType(organizationId: string) {
  const assetType = await prisma.assetType.findFirst({ where: { code: "WATERLINE", organizationId } });
  if (!assetType) throw new Error("WATERLINE asset type is not configured for this organization");
  return assetType;
}

// ---------------------------------------------------------------------------
// Condition model — scale and bands
// ---------------------------------------------------------------------------

export type ConditionModelConfig = {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
  bands: ConditionBand[];
  measurementCount: number;
};

function parseBands(value: unknown): ConditionBand[] {
  if (!Array.isArray(value)) return WCI_BANDS;
  const bands = value.filter(
    (b): b is ConditionBand =>
      !!b &&
      typeof b === "object" &&
      typeof (b as ConditionBand).label === "string" &&
      typeof (b as ConditionBand).min === "number"
  );
  return bands.length > 0 ? [...bands].sort((a, b) => b.min - a.min) : WCI_BANDS;
}

/** The bands every condition colour and grade label in the app is read from. */
export async function getConditionBands(organizationId: string): Promise<ConditionBand[]> {
  const model = await prisma.conditionModel.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId } },
    select: { bands: true },
  });
  return parseBands(model?.bands);
}

export async function getConditionModelConfig(organizationId: string): Promise<ConditionModelConfig> {
  const model = await prisma.conditionModel.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: { _count: { select: { measurements: true } } },
  });
  if (!model) throw new Error("Condition model is not configured for this organization");

  return {
    id: model.id,
    name: model.name,
    scaleMin: model.scaleMin,
    scaleMax: model.scaleMax,
    bands: parseBands(model.bands),
    measurementCount: model._count.measurements,
  };
}

export async function updateConditionModel(
  organizationId: string,
  input: { name: string; scaleMin: number; scaleMax: number; bands: ConditionBand[] }
) {
  if (!input.name.trim()) throw new Error("Model name is required");
  if (input.scaleMin >= input.scaleMax) throw new Error("Scale minimum must be below the maximum");
  if (input.bands.length === 0) throw new Error("At least one band is required");

  const sorted = [...input.bands].sort((a, b) => b.min - a.min);

  // Bands are matched by `min` on a highest-first list, so a gap silently sends
  // scores to the band below it. Requiring full coverage keeps every possible
  // score inside exactly one band.
  if (sorted[sorted.length - 1].min > input.scaleMin) {
    throw new Error(`The lowest band must start at ${input.scaleMin} so every score falls in a band`);
  }
  for (const b of sorted) {
    if (!b.label.trim()) throw new Error("Every band needs a label");
    if (b.min < input.scaleMin || b.min > input.scaleMax) {
      throw new Error(`Band "${b.label}" starts outside the ${input.scaleMin}–${input.scaleMax} scale`);
    }
  }

  const model = await prisma.conditionModel.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId } },
  });
  if (!model) throw new Error("Condition model not found");

  await prisma.conditionModel.update({
    where: { id: model.id },
    data: {
      name: input.name.trim(),
      scaleMin: input.scaleMin,
      scaleMax: input.scaleMax,
      bands: sorted,
    },
  });
}

// ---------------------------------------------------------------------------
// Risk model — POF and COF factor weights
// ---------------------------------------------------------------------------

export type RiskWeights = { pof: PofWeightMap; cof: CofWeightMap };

export type RiskModelConfig = RiskWeights & {
  id: string;
  name: string;
  assessmentCount: number;
};

/**
 * Stored weights are merged OVER the seeded set rather than replacing it, so a
 * config that is missing a key keeps that factor at its default weight instead
 * of silently dropping the factor from the score entirely.
 */
function parseWeights<T extends Record<string, number>>(value: unknown, fallback: T): T {
  const stored = (value as { weights?: unknown } | null)?.weights;
  const out = { ...fallback } as Record<string, number>;
  if (stored && typeof stored === "object") {
    for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
      if (k in out && typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out as T;
}

/** The weights risk scoring actually runs with. */
export async function getRiskWeights(organizationId: string): Promise<RiskWeights> {
  const model = await prisma.riskModel.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId } },
    select: { probabilityConfig: true, consequenceConfig: true },
  });
  return {
    pof: parseWeights(model?.probabilityConfig, POF_WEIGHTS),
    cof: parseWeights(model?.consequenceConfig, COF_WEIGHTS),
  };
}

export async function getRiskModelConfig(organizationId: string): Promise<RiskModelConfig> {
  const model = await prisma.riskModel.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: { _count: { select: { assessments: true } } },
  });
  if (!model) throw new Error("Risk model is not configured for this organization");

  return {
    id: model.id,
    name: model.name,
    assessmentCount: model._count.assessments,
    pof: parseWeights(model.probabilityConfig, POF_WEIGHTS),
    cof: parseWeights(model.consequenceConfig, COF_WEIGHTS),
  };
}

export async function updateRiskModel(
  organizationId: string,
  input: { name: string; pof: Record<string, number>; cof: Record<string, number> }
) {
  if (!input.name.trim()) throw new Error("Model name is required");

  // Weights are renormalized when factors are combined, so they need not sum
  // to 1 — but an all-zero group would make its whole score meaningless.
  const sum = (w: Record<string, number>) => Object.values(w).reduce((s, n) => s + n, 0);
  if (sum(input.pof) <= 0) throw new Error("At least one probability factor needs a weight above zero");
  if (sum(input.cof) <= 0) throw new Error("At least one consequence factor needs a weight above zero");

  const model = await prisma.riskModel.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId } },
  });
  if (!model) throw new Error("Risk model not found");

  await prisma.riskModel.update({
    where: { id: model.id },
    data: {
      name: input.name.trim(),
      probabilityConfig: { weights: input.pof, scale: "1-5" },
      consequenceConfig: { weights: input.cof, scale: "1-5" },
    },
  });
}

// ---------------------------------------------------------------------------
// Deterioration models — material curves
// ---------------------------------------------------------------------------

export type DeteriorationModelConfig = {
  id: string;
  name: string;
  modelType: string;
  material: string | null;
  isActive: boolean;
  predictionCount: number;
  curve: CurveParams;
};

const CURVE_KEYS = ["initialCondition", "minCondition", "serviceLife", "shape"] as const;

function parseCurve(params: Array<{ key: string; value: unknown }>, material: string | null): CurveParams {
  const seed = (material && MATERIAL_CURVES[material]) || DEFAULT_CURVE;
  const byKey = new Map(params.map((p) => [p.key, typeof p.value === "number" ? p.value : Number(p.value)]));
  return {
    initialCondition: byKey.get("initialCondition") ?? seed.initialCondition,
    minCondition: byKey.get("minCondition") ?? seed.minCondition,
    serviceLife: byKey.get("serviceLife") ?? seed.serviceLife,
    shape: byKey.get("shape") ?? seed.shape,
  };
}

function materialOf(applicability: unknown): string | null {
  const m = (applicability as { material?: unknown } | null)?.material;
  return typeof m === "string" ? m : null;
}

/**
 * Material → curve, as the forecasts actually run. Inactive models are skipped
 * so deactivating one falls back to the default curve rather than continuing
 * to shape the forecast invisibly.
 */
export async function getMaterialCurves(organizationId: string): Promise<Record<string, CurveParams>> {
  const models = await prisma.deteriorationModel.findMany({
    where: { assetType: { code: "WATERLINE", organizationId }, isActive: true },
    include: { parameters: true },
  });

  const curves: Record<string, CurveParams> = {};
  for (const m of models) {
    const material = materialOf(m.applicability);
    if (!material) continue;
    curves[material] = parseCurve(m.parameters, material);
  }
  return Object.keys(curves).length > 0 ? curves : MATERIAL_CURVES;
}

export async function listDeteriorationModels(organizationId: string): Promise<DeteriorationModelConfig[]> {
  const models = await prisma.deteriorationModel.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: { parameters: true, _count: { select: { predictions: true } } },
    orderBy: { name: "asc" },
  });

  return models.map((m) => {
    const material = materialOf(m.applicability);
    return {
      id: m.id,
      name: m.name,
      modelType: m.modelType,
      material,
      isActive: m.isActive,
      predictionCount: m._count.predictions,
      curve: parseCurve(m.parameters, material),
    };
  });
}

export async function updateDeteriorationModel(
  organizationId: string,
  id: string,
  input: { name: string; isActive: boolean; curve: CurveParams }
) {
  if (!input.name.trim()) throw new Error("Model name is required");
  const { initialCondition, minCondition, serviceLife, shape } = input.curve;

  if (serviceLife <= 0) throw new Error("Service life must be greater than zero");
  if (shape <= 0) throw new Error("Curve shape must be greater than zero");
  if (minCondition >= initialCondition) {
    throw new Error("Minimum condition must be below the initial condition");
  }

  const model = await prisma.deteriorationModel.findFirst({
    where: { id, assetType: { code: "WATERLINE", organizationId } },
  });
  if (!model) throw new Error("Deterioration model not found");

  await prisma.$transaction([
    prisma.deteriorationModel.update({
      where: { id },
      data: { name: input.name.trim(), isActive: input.isActive },
    }),
    prisma.deteriorationParameter.deleteMany({ where: { modelId: id } }),
    prisma.deteriorationParameter.createMany({
      data: CURVE_KEYS.map((key) => ({ modelId: id, key, value: input.curve[key] })),
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Configuration — asset classes and inspection templates
// ---------------------------------------------------------------------------

export type ConfigurationSettings = {
  assetTypes: Array<{ id: string; code: string; name: string; description: string | null; assetCount: number }>;
  templates: Array<{
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    fieldCount: number;
    inspectionCount: number;
  }>;
  attributeCount: number;
};

export async function getConfigurationSettings(organizationId: string): Promise<ConfigurationSettings> {
  const [assetTypes, templates, attributeCount] = await Promise.all([
    prisma.assetType.findMany({
      where: { organizationId },
      include: { _count: { select: { assets: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.inspectionTemplate.findMany({
      where: { assetType: { organizationId } },
      include: { _count: { select: { fields: true, inspections: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.assetAttributeDefinition.count({ where: { assetType: { organizationId } } }),
  ]);

  return {
    assetTypes: assetTypes.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      assetCount: t._count.assets,
    })),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      isActive: t.isActive,
      fieldCount: t._count.fields,
      inspectionCount: t._count.inspections,
    })),
    attributeCount,
  };
}

export async function updateAssetType(
  organizationId: string,
  id: string,
  input: { name: string; description: string | null }
) {
  if (!input.name.trim()) throw new Error("Name is required");
  const existing = await prisma.assetType.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("Asset type not found");

  // `code` stays immutable on purpose: the domain modules and every server
  // query select on "WATERLINE", so renaming it would detach the data from the
  // logic that reads it. The display name is what the UI shows.
  await prisma.assetType.update({
    where: { id },
    data: { name: input.name.trim(), description: input.description?.trim() || null },
  });
}

export async function createAssetType(
  organizationId: string,
  input: { code: string; name: string; description: string | null }
) {
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (!code) throw new Error("Code is required");
  if (!input.name.trim()) throw new Error("Name is required");

  const clash = await prisma.assetType.findFirst({ where: { code } });
  if (clash) throw new Error(`An asset type with code "${code}" already exists`);

  await prisma.assetType.create({
    data: { organizationId, code, name: input.name.trim(), description: input.description?.trim() || null },
  });
}

export async function updateInspectionTemplate(
  organizationId: string,
  id: string,
  input: { name: string; description: string | null; isActive: boolean }
) {
  if (!input.name.trim()) throw new Error("Template name is required");
  const existing = await prisma.inspectionTemplate.findFirst({
    where: { id, assetType: { organizationId } },
  });
  if (!existing) throw new Error("Inspection template not found");

  await prisma.inspectionTemplate.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      isActive: input.isActive,
    },
  });
}

// ---------------------------------------------------------------------------
// Failure types
// ---------------------------------------------------------------------------

export type FailureTypeRow = { id: string; code: string; label: string; eventCount: number };

export async function listFailureTypes(organizationId: string): Promise<FailureTypeRow[]> {
  const types = await prisma.failureType.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: { _count: { select: { events: true } } },
    orderBy: { label: "asc" },
  });
  return types.map((t) => ({ id: t.id, code: t.code, label: t.label, eventCount: t._count.events }));
}

export async function createFailureType(organizationId: string, input: { code: string; label: string }) {
  const assetType = await requireAssetType(organizationId);
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (!code) throw new Error("Code is required");
  if (!input.label.trim()) throw new Error("Label is required");

  const clash = await prisma.failureType.findFirst({ where: { assetTypeId: assetType.id, code } });
  if (clash) throw new Error(`A failure type with code "${code}" already exists`);

  await prisma.failureType.create({
    data: { assetTypeId: assetType.id, code, label: input.label.trim() },
  });
}

export async function updateFailureType(organizationId: string, id: string, input: { label: string }) {
  if (!input.label.trim()) throw new Error("Label is required");
  const existing = await prisma.failureType.findFirst({
    where: { id, assetType: { code: "WATERLINE", organizationId } },
  });
  if (!existing) throw new Error("Failure type not found");

  // The code is what recorded events and any import file refer to, so only the
  // display label is editable once the type exists.
  await prisma.failureType.update({ where: { id }, data: { label: input.label.trim() } });
}

export async function deleteFailureType(organizationId: string, id: string) {
  const existing = await prisma.failureType.findFirst({
    where: { id, assetType: { code: "WATERLINE", organizationId } },
    include: { _count: { select: { events: true } } },
  });
  if (!existing) throw new Error("Failure type not found");

  if (existing._count.events > 0) {
    throw new Error(
      `"${existing.label}" has ${existing._count.events} recorded event(s) and cannot be deleted. ` +
        `Deleting it would leave those failures with no cause.`
    );
  }

  await prisma.failureType.delete({ where: { id } });
}
