import { prisma } from "@/lib/prisma";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import {
  MATERIAL_CURVES,
  DEFAULT_CURVE,
  DEFAULT_TRANSITION_MATRIX,
  MARKOV_STATES,
  FORECAST_HORIZON_YEARS,
  forecastFromCurve,
  conditionToStateVector,
  stepStateVector,
  expectedCondition,
  remainingLifeYears,
  evaluateCurve,
  type CurveParams,
} from "@/domain/waterline/deterioration";
import { ageInYears } from "@/lib/format";

const CURVE_MODEL_PREFIX = "Curve — ";
export const MARKOV_MODEL_NAME = "Markov State-Transition (network)";

/** Idempotently create one curve model per material plus the Markov model. */
export async function ensureDeteriorationModels(organizationId: string) {
  const assetType = await prisma.assetType.findFirst({ where: { code: "WATERLINE", organizationId } });
  if (!assetType) throw new Error("WATERLINE asset type not found");

  for (const [material, params] of Object.entries(MATERIAL_CURVES)) {
    const name = `${CURVE_MODEL_PREFIX}${material}`;
    const existing = await prisma.deteriorationModel.findFirst({ where: { assetTypeId: assetType.id, name } });
    if (existing) continue;
    await prisma.deteriorationModel.create({
      data: {
        assetTypeId: assetType.id,
        name,
        modelType: "POLYNOMIAL",
        applicability: { material },
        parameters: {
          create: Object.entries(params).map(([key, value]) => ({ key, value })),
        },
      },
    });
  }

  const markovExisting = await prisma.deteriorationModel.findFirst({
    where: { assetTypeId: assetType.id, name: MARKOV_MODEL_NAME },
  });
  if (!markovExisting) {
    await prisma.deteriorationModel.create({
      data: {
        assetTypeId: assetType.id,
        name: MARKOV_MODEL_NAME,
        modelType: "MARKOV",
        applicability: { material: "*" },
        parameters: {
          create: [
            { key: "states", value: MARKOV_STATES },
            { key: "transitionMatrix", value: DEFAULT_TRANSITION_MATRIX },
          ],
        },
      },
    });
  }
}

function curveParamsFromRows(rows: Array<{ key: string; value: unknown }>): CurveParams {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    initialCondition: Number(map.initialCondition ?? DEFAULT_CURVE.initialCondition),
    minCondition: Number(map.minCondition ?? DEFAULT_CURVE.minCondition),
    serviceLife: Number(map.serviceLife ?? DEFAULT_CURVE.serviceLife),
    shape: Number(map.shape ?? DEFAULT_CURVE.shape),
  };
}

async function getCurveModelsByMaterial(organizationId: string) {
  const models = await prisma.deteriorationModel.findMany({
    where: { assetType: { code: "WATERLINE", organizationId }, isActive: true, modelType: { not: "MARKOV" } },
    include: { parameters: true },
  });
  const byMaterial = new Map<string, { id: string; name: string; params: CurveParams }>();
  for (const model of models) {
    const material = (model.applicability as { material?: string }).material;
    if (!material || material === "*") continue;
    byMaterial.set(material, { id: model.id, name: model.name, params: curveParamsFromRows(model.parameters) });
  }
  return byMaterial;
}

/** Regenerate 10-year "current trajectory" predictions for every active
 * waterline, anchored to its latest observed WCI (or calendar age when never
 * inspected). Replaces prior current-scenario predictions — forecasts are
 * derived data, unlike append-only assessments. */
export async function generatePredictions(organizationId: string): Promise<number> {
  await ensureDeteriorationModels(organizationId);
  const curveByMaterial = await getCurveModelsByMaterial(organizationId);
  const startYear = new Date().getFullYear();

  const assets = await prisma.asset.findMany({
    where: { organizationId, assetType: { code: "WATERLINE" }, deletedAt: null, status: "ACTIVE" },
    include: {
      attributeValues: { include: { definition: true } },
      conditionMeasurements: { orderBy: { measurementDate: "desc" }, take: 1 },
    },
  });

  await prisma.deteriorationPrediction.deleteMany({
    where: { scenario: "current", asset: { organizationId } },
  });

  let count = 0;
  for (const asset of assets) {
    const material = asset.attributeValues.find((v) => v.definition.code === WATERLINE_ATTRIBUTES.MATERIAL)?.textValue;
    const model = material ? curveByMaterial.get(material) : undefined;
    if (!model) continue;

    const latest = asset.conditionMeasurements[0];
    const age = ageInYears(asset.installationDate);
    const anchor = latest ? { condition: latest.score } : { ageYears: age ?? 0 };
    const points = forecastFromCurve(model.params, anchor, startYear, FORECAST_HORIZON_YEARS);

    await prisma.deteriorationPrediction.createMany({
      data: points.map((p) => ({
        assetId: asset.id,
        modelId: model.id,
        forecastYear: p.year,
        predictedCondition: p.predictedCondition,
        scenario: "current",
        modelVersion: "v1",
      })),
    });
    count++;
  }
  return count;
}

export async function getForecastForAsset(organizationId: string, assetId: string) {
  const predictions = await prisma.deteriorationPrediction.findMany({
    where: { assetId, scenario: "current", asset: { organizationId } },
    orderBy: { forecastYear: "asc" },
    include: { model: { select: { name: true } } },
  });
  if (predictions.length === 0) return null;

  const modelName = predictions[0].model.name;
  const material = modelName.startsWith(CURVE_MODEL_PREFIX) ? modelName.slice(CURVE_MODEL_PREFIX.length) : null;
  const params = material ? (MATERIAL_CURVES[material] ?? DEFAULT_CURVE) : DEFAULT_CURVE;
  const current = predictions[0].predictedCondition;

  return {
    modelName,
    points: predictions.map((p) => ({ year: p.forecastYear, predictedCondition: p.predictedCondition })),
    remainingLifeYears: remainingLifeYears(params, current),
  };
}

export type NetworkForecast = {
  startYear: number;
  /** Average predicted WCI by calendar year (curve models, "do nothing"). */
  curve: Array<{ year: number; avgCondition: number }>;
  /** Markov expected network WCI by year, for model comparison. */
  markov: Array<{ year: number; avgCondition: number }>;
};

export async function getNetworkForecast(organizationId: string): Promise<NetworkForecast> {
  const startYear = new Date().getFullYear();

  const rows = await prisma.deteriorationPrediction.groupBy({
    by: ["forecastYear"],
    where: { scenario: "current", asset: { organizationId, deletedAt: null } },
    _avg: { predictedCondition: true },
    orderBy: { forecastYear: "asc" },
  });
  const curve = rows.map((r) => ({
    year: r.forecastYear,
    avgCondition: Math.round((r._avg.predictedCondition ?? 0) * 10) / 10,
  }));

  // Markov comparison: start every inspected asset in its current band and
  // evolve the aggregate distribution with the shared network matrix.
  const measurements = await prisma.conditionMeasurement.findMany({
    where: { asset: { organizationId, deletedAt: null, status: "ACTIVE" } },
    orderBy: [{ assetId: "asc" }, { measurementDate: "desc" }],
    distinct: ["assetId"],
    select: { score: true },
  });
  const markov: Array<{ year: number; avgCondition: number }> = [];
  if (measurements.length > 0) {
    let aggregate = measurements
      .map((m) => conditionToStateVector(m.score))
      .reduce((sum, v) => sum.map((s, i) => s + v[i]))
      .map((s) => s / measurements.length);
    for (let i = 0; i <= FORECAST_HORIZON_YEARS; i++) {
      markov.push({ year: startYear + i, avgCondition: expectedCondition(aggregate) });
      aggregate = stepStateVector(aggregate, DEFAULT_TRANSITION_MATRIX);
    }
  }

  return { startYear, curve, markov };
}

export async function listDeteriorationModels(organizationId: string) {
  const models = await prisma.deteriorationModel.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: { parameters: true, _count: { select: { predictions: true } } },
    orderBy: { name: "asc" },
  });
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    modelType: m.modelType,
    applicability: m.applicability as Record<string, unknown>,
    isActive: m.isActive,
    predictionCount: m._count.predictions,
    parameters: Object.fromEntries(m.parameters.map((p) => [p.key, p.value])),
  }));
}

/** Curve shapes for the model-comparison chart: WCI vs age per material. */
export function getMaterialCurveSeries(maxAge = 90, step = 5) {
  const ages = Array.from({ length: Math.floor(maxAge / step) + 1 }, (_, i) => i * step);
  return ages.map((age) => {
    const row: Record<string, number> = { age };
    for (const [material, params] of Object.entries(MATERIAL_CURVES)) {
      row[material] = evaluateCurve(params, age);
    }
    return row;
  });
}
