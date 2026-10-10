import { prisma } from "@/lib/prisma";
import { getMeasureCodes, readMeasures } from "@/server/measures";
import { getTransitionMatrix } from "@/server/settings";
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
import { MODELLED, chooseModelledAssetType, listModelledAssetTypes, modelledType } from "@/server/modelled-asset-type";

const CURVE_MODEL_PREFIX = "Curve — ";
export const MARKOV_MODEL_NAME = "Markov State-Transition (network)";

/**
 * Give each modelled asset type that has no deterioration models of its own
 * the built-in set: one curve per material plus the Markov model. A type that
 * already has any — its own curves, or its components' — is left as it is,
 * rather than having another asset class's curves added to it.
 */
export async function ensureDeteriorationModels(organizationId: string) {
  for (const assetType of await listModelledAssetTypes(organizationId)) {
    const hasModels = await prisma.deteriorationModel.count({ where: { assetTypeId: assetType.id } });
    if (hasModels === 0) await createBuiltInModels(assetType.id);
  }
}

async function createBuiltInModels(assetTypeId: string) {
  for (const [material, params] of Object.entries(MATERIAL_CURVES)) {
    const name = `${CURVE_MODEL_PREFIX}${material}`;
    const existing = await prisma.deteriorationModel.findFirst({ where: { assetTypeId, name } });
    if (existing) continue;
    await prisma.deteriorationModel.create({
      data: {
        assetTypeId,
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
    where: { assetTypeId, name: MARKOV_MODEL_NAME },
  });
  if (!markovExisting) {
    await prisma.deteriorationModel.create({
      data: {
        assetTypeId,
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

type CurveModel = { id: string; name: string; params: CurveParams };

/** Each modelled asset type's active curves, by material: two asset classes
 * can share a material name and nothing else. */
async function getCurveModelsByType(organizationId: string) {
  const models = await prisma.deteriorationModel.findMany({
    where: { assetType: modelledType(organizationId), isActive: true, modelType: { not: "MARKOV" } },
    include: { parameters: true },
  });
  const byType = new Map<string, Map<string, CurveModel>>();
  for (const model of models) {
    const material = (model.applicability as { material?: string }).material;
    if (!material || material === "*") continue;
    const byMaterial = byType.get(model.assetTypeId) ?? new Map<string, CurveModel>();
    byMaterial.set(material, { id: model.id, name: model.name, params: curveParamsFromRows(model.parameters) });
    byType.set(model.assetTypeId, byMaterial);
  }
  return byType;
}

/** Regenerate 10-year "current trajectory" predictions for every active
 * waterline, anchored to its latest observed WCI (or calendar age when never
 * inspected). Replaces prior current-scenario predictions — forecasts are
 * derived data, unlike append-only assessments. */
export async function generatePredictions(organizationId: string): Promise<number> {
  await ensureDeteriorationModels(organizationId);
  const curvesByType = await getCurveModelsByType(organizationId);
  const startYear = new Date().getFullYear();

  const assets = await prisma.asset.findMany({
    where: { organizationId, assetType: MODELLED, deletedAt: null, status: "ACTIVE" },
    include: {
      attributeValues: { include: { definition: true } },
      conditionMeasurements: { where: { assetComponentId: null }, orderBy: { measurementDate: "desc" }, take: 1 },
    },
  });

  await prisma.deteriorationPrediction.deleteMany({
    where: { scenario: "current", asset: { organizationId } },
  });

  const measuresOf = await getMeasureCodes(organizationId);
  let count = 0;
  for (const asset of assets) {
    const material = readMeasures(asset.attributeValues, measuresOf(asset.assetTypeId)).material;
    const model = material ? curvesByType.get(asset.assetTypeId)?.get(material) : undefined;
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
  // The matrices configured in Settings, not the seeded constant — otherwise
  // the stored one is shown to administrators while a different one drives
  // the forecast. Each modelled asset type steps with its own; any other
  // asset, with the main network's.
  const { types, selected } = await chooseModelledAssetType(organizationId);
  const matrices = new Map(
    await Promise.all(types.map(async (t) => [t.id, await getTransitionMatrix(organizationId, t.id)] as const))
  );
  const MAIN = "main";
  const groupOf = (assetTypeId: string) => (matrices.has(assetTypeId) && assetTypeId !== selected?.id ? assetTypeId : MAIN);
  const matrixOf = (group: string) =>
    (group === MAIN ? selected && matrices.get(selected.id) : matrices.get(group)) ?? DEFAULT_TRANSITION_MATRIX;
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
    where: { assetComponentId: null, asset: { organizationId, deletedAt: null, status: "ACTIVE" } },
    orderBy: [{ assetId: "asc" }, { measurementDate: "desc" }],
    distinct: ["assetId"],
    select: { score: true, asset: { select: { assetTypeId: true } } },
  });
  const markov: Array<{ year: number; avgCondition: number }> = [];
  if (measurements.length > 0) {
    // Each group's share of the network, stepped with its own matrix. Stepping
    // is linear, so one group gives exactly the single network aggregate.
    const groups = new Map<string, number[][]>();
    for (const m of measurements) {
      const key = groupOf(m.asset.assetTypeId);
      const vectors = groups.get(key) ?? [];
      vectors.push(conditionToStateVector(m.score));
      groups.set(key, vectors);
    }
    let shares = [...groups.entries()].map(([key, vectors]) => ({
      matrix: matrixOf(key),
      vector: vectors.reduce((sum, v) => sum.map((s, i) => s + v[i])).map((s) => s / measurements.length),
    }));
    for (let i = 0; i <= FORECAST_HORIZON_YEARS; i++) {
      const aggregate = shares.map((g) => g.vector).reduce((sum, v) => sum.map((s, j) => s + v[j]));
      markov.push({ year: startYear + i, avgCondition: expectedCondition(aggregate) });
      shares = shares.map((g) => ({ ...g, vector: stepStateVector(g.vector, g.matrix) }));
    }
  }

  return { startYear, curve, markov };
}

export async function listDeteriorationModels(organizationId: string) {
  const models = await prisma.deteriorationModel.findMany({
    where: { assetType: modelledType(organizationId) },
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
