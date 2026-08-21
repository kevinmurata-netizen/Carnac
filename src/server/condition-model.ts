import { prisma } from "@/lib/prisma";
import {
  WCI_COMPONENT_WEIGHTS,
  WCI_BANDS,
  computeWCI,
  type ConditionBand,
} from "@/domain/waterline/condition";

/**
 * The Condition Index is configuration, not code: its components and their
 * weights live on the ConditionModel row and are edited in Administration.
 *
 * A component is a numeric inspection field plus a weight. The two are joined
 * by `code`, so adding a component means adding an InspectionTemplateField AND
 * a weight entry — otherwise you would have a weight nothing can score, or a
 * field that never reaches the index.
 */

export type IndexComponent = {
  code: string;
  label: string;
  /** Raw configured weight, as entered. */
  weight: number;
  /** Share of the total, which is what actually drives the score. */
  sharePct: number;
  fieldId: string | null;
  helpText: string | null;
  /** Recorded answers — how much history depends on this component. */
  resultCount: number;
  /** True when a weight exists but no inspection field can produce a score. */
  orphaned: boolean;
};

export type UnusedField = {
  fieldId: string;
  code: string;
  label: string;
  resultCount: number;
};

export type ConditionIndexConfig = {
  modelId: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
  bands: ConditionBand[];
  components: IndexComponent[];
  /** Numeric inspection fields with no weight — candidates to add. */
  unusedFields: UnusedField[];
  totalWeight: number;
  measurementCount: number;
  templateId: string | null;
};

function parseWeights(formula: unknown): Record<string, number> {
  const components = (formula as { components?: Record<string, unknown> } | null)?.components;
  if (!components || typeof components !== "object") return { ...WCI_COMPONENT_WEIGHTS };
  const out: Record<string, number> = {};
  for (const [code, value] of Object.entries(components)) {
    const n = Number(value);
    if (Number.isFinite(n)) out[code] = n;
  }
  return Object.keys(out).length > 0 ? out : { ...WCI_COMPONENT_WEIGHTS };
}

function parseBands(bands: unknown): ConditionBand[] {
  if (!Array.isArray(bands)) return WCI_BANDS;
  const parsed = bands.filter(
    (b): b is ConditionBand =>
      !!b && typeof b === "object" && "label" in b && "min" in b && "max" in b && "color" in b
  );
  return parsed.length > 0 ? parsed : WCI_BANDS;
}

async function requireModel(organizationId: string) {
  const model = await prisma.conditionModel.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId } },
  });
  if (!model) throw new Error("Condition index is not configured for this organization");
  return model;
}

/** Live weights for scoring. Used by inspection creation so a new inspection
 * is always scored with the currently configured index. */
export async function getIndexWeights(organizationId: string): Promise<Record<string, number>> {
  const model = await prisma.conditionModel.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId } },
    select: { formula: true },
  });
  return parseWeights(model?.formula);
}

export async function getConditionIndex(organizationId: string): Promise<ConditionIndexConfig> {
  const model = await requireModel(organizationId);
  const weights = parseWeights(model.formula);

  const template = await prisma.inspectionTemplate.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId }, isActive: true },
    include: {
      fields: {
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { results: true } } },
      },
    },
  });

  const numericFields = (template?.fields ?? []).filter((f) => f.dataType === "NUMBER");
  const fieldByCode = new Map(numericFields.map((f) => [f.code, f]));

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + Math.max(0, w), 0);

  const components: IndexComponent[] = Object.entries(weights)
    .map(([code, weight]) => {
      const field = fieldByCode.get(code);
      return {
        code,
        label: field?.label ?? code,
        weight,
        sharePct: totalWeight > 0 ? Math.round((Math.max(0, weight) / totalWeight) * 1000) / 10 : 0,
        fieldId: field?.id ?? null,
        helpText: (field?.config as { helpText?: string } | null)?.helpText ?? null,
        resultCount: field?._count.results ?? 0,
        orphaned: !field,
      };
    })
    .sort((a, b) => b.weight - a.weight);

  const unusedFields: UnusedField[] = numericFields
    .filter((f) => !(f.code in weights))
    .map((f) => ({ fieldId: f.id, code: f.code, label: f.label, resultCount: f._count.results }));

  const measurementCount = await prisma.conditionMeasurement.count({
    where: { conditionModelId: model.id },
  });

  return {
    modelId: model.id,
    name: model.name,
    scaleMin: model.scaleMin,
    scaleMax: model.scaleMax,
    bands: parseBands(model.bands),
    components,
    unusedFields,
    totalWeight,
    measurementCount,
    templateId: template?.id ?? null,
  };
}

async function writeWeights(organizationId: string, weights: Record<string, number>) {
  const model = await requireModel(organizationId);
  const existing = (model.formula ?? {}) as Record<string, unknown>;
  await prisma.conditionModel.update({
    where: { id: model.id },
    data: {
      formula: {
        ...existing,
        method: "weighted_average_0_10_scale",
        components: weights,
      },
    },
  });
}

export async function updateComponentWeights(organizationId: string, weights: Record<string, number>) {
  const clean: Record<string, number> = {};
  for (const [code, value] of Object.entries(weights)) {
    if (!Number.isFinite(value) || value < 0) continue;
    clean[code] = value;
  }
  if (Object.keys(clean).length === 0) {
    throw new Error("At least one component must carry a weight greater than zero");
  }
  if (Object.values(clean).every((w) => w === 0)) {
    throw new Error("At least one component must carry a weight greater than zero");
  }
  await writeWeights(organizationId, clean);
}

/** Add a brand-new component: creates the inspection field that will collect
 * it, then gives it a weight. */
export async function addComponent(
  organizationId: string,
  input: { code: string; label: string; weight: number; helpText?: string }
) {
  const code = input.code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!code) throw new Error("Component code is required");
  if (!input.label.trim()) throw new Error("Component label is required");

  const template = await prisma.inspectionTemplate.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId }, isActive: true },
    include: { fields: true },
  });
  if (!template) throw new Error("No active inspection template to attach the component to");

  const weights = await getIndexWeights(organizationId);
  if (code in weights) throw new Error(`"${code}" is already a component of the index`);

  const existingField = template.fields.find((f) => f.code === code);
  if (existingField && existingField.dataType !== "NUMBER") {
    throw new Error(`Inspection field "${code}" is not numeric, so it cannot be scored`);
  }

  if (!existingField) {
    const maxSort = template.fields.reduce((m, f) => Math.max(m, f.sortOrder), 0);
    await prisma.inspectionTemplateField.create({
      data: {
        templateId: template.id,
        code,
        label: input.label.trim(),
        dataType: "NUMBER",
        isRequired: true,
        sortOrder: maxSort + 10,
        config: {
          helpText: input.helpText?.trim() || "0 = severe deficiency, 10 = no issue observed",
          min: 0,
          max: 10,
        },
      },
    });
  }

  await writeWeights(organizationId, { ...weights, [code]: input.weight });
}

/** Adopt an existing numeric inspection field into the index. */
export async function addExistingFieldAsComponent(organizationId: string, code: string, weight: number) {
  const weights = await getIndexWeights(organizationId);
  if (code in weights) throw new Error(`"${code}" is already a component`);
  await writeWeights(organizationId, { ...weights, [code]: weight });
}

/**
 * Drop a component from the index. The inspection field and all recorded
 * answers are left alone — removing something from the scoring formula should
 * not silently destroy field data. Delete the field itself from the Fields
 * screen if that is genuinely intended.
 */
export async function removeComponent(organizationId: string, code: string) {
  const weights = await getIndexWeights(organizationId);
  if (!(code in weights)) throw new Error(`"${code}" is not a component of the index`);
  if (Object.keys(weights).length === 1) {
    throw new Error("The index needs at least one component");
  }
  delete weights[code];
  await writeWeights(organizationId, weights);
}

export async function updateBands(organizationId: string, bands: ConditionBand[]) {
  const model = await requireModel(organizationId);
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  await prisma.conditionModel.update({ where: { id: model.id }, data: { bands: sorted } });
}

export type RecalculationResult = { inspectionsScored: number; measurementsUpdated: number };

/**
 * Replay every inspection's stored answers through the current weights.
 *
 * Changing weights makes previously-stored scores stale — they were computed
 * under the old formula. Because the raw InspectionResult rows are kept, the
 * whole history can be recomputed rather than left inconsistent. Manual
 * overrides are not touched: they were entered by a person, not derived.
 */
export async function recalculateConditionScores(organizationId: string): Promise<RecalculationResult> {
  const model = await requireModel(organizationId);
  const weights = parseWeights(model.formula);

  const inspections = await prisma.inspection.findMany({
    where: { asset: { organizationId, deletedAt: null } },
    include: {
      results: { include: { field: { select: { code: true, dataType: true } } } },
      conditionMeasurements: { where: { conditionModelId: model.id, source: "Inspection" } },
    },
  });

  let measurementsUpdated = 0;
  for (const inspection of inspections) {
    const scores: Record<string, number> = {};
    for (const r of inspection.results) {
      if (r.field.dataType !== "NUMBER" || r.numberValue == null) continue;
      scores[r.field.code] = r.numberValue;
    }
    if (Object.keys(scores).length === 0) continue;

    const score = computeWCI(scores, weights);
    for (const measurement of inspection.conditionMeasurements) {
      if (measurement.score === score) continue;
      await prisma.conditionMeasurement.update({ where: { id: measurement.id }, data: { score } });
      measurementsUpdated++;
    }
  }

  return { inspectionsScored: inspections.length, measurementsUpdated };
}
