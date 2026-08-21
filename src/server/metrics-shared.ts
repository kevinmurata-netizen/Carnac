/**
 * A metric is a named, banded measure read from one field in the database.
 *
 * Metrics are stored as ConditionModel rows so they get the same scale and
 * bands machinery as the condition index, and are told apart from it by
 * `metricSource` in the formula column. This lives in its own module because
 * both condition-model.ts and settings.ts need the discriminator, and importing
 * one from the other would be circular.
 */

export type MetricSourceKind = "inspection" | "inventory";

export type MetricSource = {
  kind: MetricSourceKind;
  /** Field code — InspectionTemplateField.code or AssetAttributeDefinition.code. */
  code: string;
  label: string;
  unit: string | null;
};

export function isDerivedMetric(formula: unknown): boolean {
  return readMetricSource(formula) !== null;
}

export function readMetricSource(formula: unknown): MetricSource | null {
  const source = (formula as { metricSource?: unknown } | null)?.metricSource;
  if (!source || typeof source !== "object") return null;

  const s = source as Partial<MetricSource>;
  if ((s.kind !== "inspection" && s.kind !== "inventory") || typeof s.code !== "string") return null;

  return {
    kind: s.kind,
    code: s.code,
    label: typeof s.label === "string" ? s.label : s.code,
    unit: typeof s.unit === "string" ? s.unit : null,
  };
}
