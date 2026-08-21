import { prisma } from "@/lib/prisma";
import type { ConditionBand } from "@/domain/waterline/condition";
import { parseBands, requireAssetType } from "@/server/settings";
import {
  isDerivedMetric,
  readMetricSource,
  type MetricSource,
  type MetricSourceKind,
} from "@/server/metrics-shared";

/**
 * Metrics are banded measures read from a single inspection or inventory field.
 *
 * They reuse ConditionModel rows so they inherit the same scale-and-bands
 * machinery as the condition index, and are distinguished from it by
 * `metricSource` in the formula column. Everything that looks up the index
 * filters these out — see findIndexModel in condition-model.ts.
 */

/** A field a metric can be built on. Only numeric fields qualify: banding
 * values requires an ordered scale. */
export type MetricSourceOption = {
  kind: MetricSourceKind;
  code: string;
  label: string;
  unit: string | null;
  /** How many assets carry a value, so an empty field is visibly a poor choice. */
  valueCount: number;
  observedMin: number | null;
  observedMax: number | null;
  inUse: boolean;
};

export type MetricConfig = {
  id: string;
  name: string;
  source: MetricSource;
  scaleMin: number;
  scaleMax: number;
  bands: ConditionBand[];
  /** Live distribution, so a metric visibly measures something rather than
   * just being defined. */
  assetsMeasured: number;
  observedMin: number | null;
  observedMax: number | null;
  observedAvg: number | null;
  distribution: Array<{ label: string; color: string; count: number }>;
};

/** Current numeric value per asset for one field. */
async function readFieldValues(
  organizationId: string,
  kind: MetricSourceKind,
  code: string
): Promise<number[]> {
  if (kind === "inventory") {
    const rows = await prisma.assetAttributeValue.findMany({
      where: {
        definition: { code, assetType: { organizationId } },
        asset: { organizationId, deletedAt: null, status: "ACTIVE" },
        numberValue: { not: null },
      },
      select: { numberValue: true },
    });
    return rows.map((r) => r.numberValue!).filter((v) => v != null);
  }

  // Only the most recent inspection per asset counts, so a metric reflects the
  // current state instead of mixing surveys from different years.
  const rows = await prisma.inspectionResult.findMany({
    where: {
      field: { code, template: { assetType: { organizationId } } },
      numberValue: { not: null },
      inspection: { asset: { organizationId, deletedAt: null, status: "ACTIVE" } },
    },
    select: { numberValue: true, inspection: { select: { assetId: true, inspectionDate: true } } },
    orderBy: { inspection: { inspectionDate: "desc" } },
  });

  const seen = new Set<string>();
  const values: number[] = [];
  for (const r of rows) {
    const assetId = r.inspection.assetId;
    if (seen.has(assetId) || r.numberValue == null) continue;
    seen.add(assetId);
    values.push(r.numberValue);
  }
  return values;
}

export async function listMetricSources(organizationId: string): Promise<MetricSourceOption[]> {
  const [attributes, fields, models] = await Promise.all([
    prisma.assetAttributeDefinition.findMany({
      where: { assetType: { organizationId }, dataType: "NUMBER" },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.inspectionTemplateField.findMany({
      where: { template: { assetType: { organizationId } }, dataType: "NUMBER" },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.conditionModel.findMany({
      where: { assetType: { code: "WATERLINE", organizationId } },
      select: { formula: true },
    }),
  ]);

  const used = new Set(
    models
      .map((m) => readMetricSource(m.formula))
      .filter((s): s is MetricSource => s !== null)
      .map((s) => `${s.kind}:${s.code}`)
  );

  const options: MetricSourceOption[] = [];
  for (const [kind, rows] of [
    ["inventory", attributes],
    ["inspection", fields],
  ] as const) {
    for (const row of rows) {
      const values = await readFieldValues(organizationId, kind, row.code);
      options.push({
        kind,
        code: row.code,
        label: row.label,
        unit: row.unit,
        valueCount: values.length,
        observedMin: values.length ? Math.round(Math.min(...values) * 10) / 10 : null,
        observedMax: values.length ? Math.round(Math.max(...values) * 10) / 10 : null,
        inUse: used.has(`${kind}:${row.code}`),
      });
    }
  }
  return options;
}

export async function listMetrics(organizationId: string): Promise<MetricConfig[]> {
  const models = await prisma.conditionModel.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    orderBy: { name: "asc" },
  });

  const metrics: MetricConfig[] = [];
  for (const model of models) {
    const source = readMetricSource(model.formula);
    if (!source) continue;

    const bands = parseBands(model.bands);
    const ordered = [...bands].sort((a, b) => b.min - a.min);
    const values = await readFieldValues(organizationId, source.kind, source.code);

    const counts = new Map(bands.map((b) => [b.label, 0]));
    for (const v of values) {
      const band = ordered.find((b) => v >= b.min) ?? ordered[ordered.length - 1];
      if (band) counts.set(band.label, (counts.get(band.label) ?? 0) + 1);
    }

    metrics.push({
      id: model.id,
      name: model.name,
      source,
      scaleMin: model.scaleMin,
      scaleMax: model.scaleMax,
      bands,
      assetsMeasured: values.length,
      observedMin: values.length ? Math.round(Math.min(...values) * 10) / 10 : null,
      observedMax: values.length ? Math.round(Math.max(...values) * 10) / 10 : null,
      observedAvg: values.length
        ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10
        : null,
      distribution: bands.map((b) => ({ label: b.label, color: b.color, count: counts.get(b.label) ?? 0 })),
    });
  }
  return metrics;
}

export type MetricInput = {
  name: string;
  scaleMin: number;
  scaleMax: number;
  bands: ConditionBand[];
};

function validateMetric(input: MetricInput): ConditionBand[] {
  if (!input.name.trim()) throw new Error("Metric name is required");
  if (input.scaleMin >= input.scaleMax) throw new Error("Scale minimum must be below the maximum");
  if (input.bands.length === 0) throw new Error("A metric needs at least one band");

  const sorted = [...input.bands].sort((a, b) => b.min - a.min);
  if (sorted[sorted.length - 1].min > input.scaleMin) {
    throw new Error(`The lowest band must start at ${input.scaleMin} so every value falls in a band`);
  }
  for (const b of sorted) {
    if (!b.label.trim()) throw new Error("Every band needs a label");
  }
  return sorted;
}

export async function createMetric(
  organizationId: string,
  input: MetricInput & { sourceKind: MetricSourceKind; sourceCode: string }
) {
  const sorted = validateMetric(input);
  const assetType = await requireAssetType(organizationId);

  const sources = await listMetricSources(organizationId);
  const source = sources.find((s) => s.kind === input.sourceKind && s.code === input.sourceCode);
  if (!source) throw new Error("Choose a numeric inspection or inventory field to measure");
  if (source.inUse) throw new Error(`A metric already measures ${source.label}`);

  const clash = await prisma.conditionModel.findFirst({
    where: { assetTypeId: assetType.id, name: input.name.trim() },
  });
  if (clash) throw new Error(`Something named "${input.name.trim()}" already exists`);

  await prisma.conditionModel.create({
    data: {
      assetTypeId: assetType.id,
      name: input.name.trim(),
      scaleMin: input.scaleMin,
      scaleMax: input.scaleMax,
      bands: sorted,
      formula: {
        metricSource: { kind: source.kind, code: source.code, label: source.label, unit: source.unit },
      },
    },
  });
}

/** Loads the row and refuses if it is the condition index rather than a metric. */
async function requireMetric(organizationId: string, id: string) {
  const model = await prisma.conditionModel.findFirst({
    where: { id, assetType: { code: "WATERLINE", organizationId } },
    include: { _count: { select: { measurements: true } } },
  });
  if (!model) throw new Error("Metric not found");
  if (!isDerivedMetric(model.formula)) {
    throw new Error("That is the condition index, not a metric — edit it under Condition Index");
  }
  return model;
}

export async function updateMetric(organizationId: string, id: string, input: MetricInput) {
  const sorted = validateMetric(input);
  await requireMetric(organizationId, id);

  await prisma.conditionModel.update({
    where: { id },
    data: { name: input.name.trim(), scaleMin: input.scaleMin, scaleMax: input.scaleMax, bands: sorted },
  });
}

export async function deleteMetric(organizationId: string, id: string) {
  const model = await requireMetric(organizationId, id);
  if (model._count.measurements > 0) {
    throw new Error(`"${model.name}" has ${model._count.measurements} stored measurements and cannot be deleted`);
  }
  await prisma.conditionModel.delete({ where: { id } });
}
