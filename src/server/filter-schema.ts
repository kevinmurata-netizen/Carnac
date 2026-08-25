import { prisma } from "@/lib/prisma";
import { getConditionBand } from "@/domain/waterline/condition";
import { getRiskBand } from "@/domain/waterline/risk";
import { getConditionBands } from "@/server/settings";
import { ageInYears } from "@/lib/format";

/**
 * The set of fields a filter can select and test.
 *
 * Deliberately curated rather than a raw dump of `information_schema`. The
 * database holds `users.passwordHash`, Prisma's migration table and PostGIS
 * bookkeeping tables — none of which belong in a query builder, and the first
 * of which must never be selectable at all.
 *
 * Inventory attributes and inspection fields ARE read from the database, so
 * this still reflects the real schema: add a field under Administration and it
 * appears here without a code change.
 *
 * Every row is one water segment. Related records are folded onto it as latest
 * values and counts, which is how people ask these questions ("segments in
 * Poor condition with more than two failures") rather than as joins.
 */

export type FieldType = "text" | "number" | "date" | "boolean";

export type FilterField = {
  key: string;
  label: string;
  type: FieldType;
  /** Known values, offered as suggestions for `in` / `not in`. */
  options?: string[];
  description?: string;
};

export type FilterTable = {
  key: string;
  label: string;
  description: string;
  fields: FilterField[];
};

export type FilterRow = Record<string, string | number | boolean | null>;

export const OPERATORS = [
  { key: "eq", label: "equals", types: ["text", "number", "date", "boolean"], values: 1 },
  { key: "ne", label: "does not equal", types: ["text", "number", "date", "boolean"], values: 1 },
  { key: "gt", label: "greater than", types: ["number", "date"], values: 1 },
  { key: "gte", label: "greater than or equal", types: ["number", "date"], values: 1 },
  { key: "lt", label: "less than", types: ["number", "date"], values: 1 },
  { key: "lte", label: "less than or equal", types: ["number", "date"], values: 1 },
  { key: "between", label: "between", types: ["number", "date"], values: 2 },
  { key: "in", label: "is one of", types: ["text", "number"], values: 1 },
  { key: "nin", label: "is not one of", types: ["text", "number"], values: 1 },
  { key: "contains", label: "contains", types: ["text"], values: 1 },
  { key: "empty", label: "is empty", types: ["text", "number", "date", "boolean"], values: 0 },
  { key: "notEmpty", label: "is not empty", types: ["text", "number", "date", "boolean"], values: 0 },
] as const;

export type OperatorKey = (typeof OPERATORS)[number]["key"];

export type Criterion = {
  field: string;
  operator: OperatorKey;
  /** For `in` / `not in`, a comma-separated list. For `between`, the low end. */
  value: string;
  /** Only used by `between`. */
  value2?: string;
};

export function operatorsFor(type: FieldType) {
  return OPERATORS.filter((o) => (o.types as readonly string[]).includes(type));
}

/** Builds the queryable schema, reading attribute and inspection fields live. */
export async function getFilterSchema(organizationId: string): Promise<FilterTable[]> {
  const [attributes, inspectionFields, areas, materials] = await Promise.all([
    prisma.assetAttributeDefinition.findMany({
      where: { assetType: { organizationId } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.inspectionTemplateField.findMany({
      where: { template: { assetType: { organizationId } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.assetLocation.findMany({
      where: { asset: { organizationId } },
      select: { serviceArea: true },
      distinct: ["serviceArea"],
    }),
    prisma.assetAttributeValue.findMany({
      where: { definition: { code: "MATERIAL" }, asset: { organizationId } },
      select: { textValue: true },
      distinct: ["textValue"],
    }),
  ]);

  const attrType = (dataType: string): FieldType =>
    dataType === "NUMBER" ? "number" : dataType === "DATE" ? "date" : dataType === "BOOLEAN" ? "boolean" : "text";

  return [
    {
      key: "asset",
      label: "Water Segment",
      description: "The segment itself",
      fields: [
        { key: "asset.assetCode", label: "Segment Code", type: "text" },
        { key: "asset.name", label: "Name", type: "text" },
        { key: "asset.status", label: "Status", type: "text", options: ["ACTIVE", "INACTIVE", "ABANDONED", "PLANNED", "REMOVED"] },
        { key: "asset.installationDate", label: "Installation Date", type: "date" },
        { key: "asset.ageYears", label: "Age (years)", type: "number" },
        { key: "asset.expectedUsefulLife", label: "Expected Life (years)", type: "number" },
        {
          key: "asset.ageRatio",
          label: "Age vs Expected Life (%)",
          type: "number",
          description: "Age as a percentage of expected life",
        },
      ],
    },
    {
      key: "location",
      label: "Location",
      description: "Where the segment is",
      fields: [
        {
          key: "location.serviceArea",
          label: "Service Area",
          type: "text",
          options: areas.map((a) => a.serviceArea).filter((s): s is string => !!s).sort(),
        },
        { key: "location.pressureZone", label: "Pressure Zone", type: "text" },
        { key: "location.depth", label: "Depth (ft)", type: "number" },
      ],
    },
    {
      key: "attribute",
      label: "Inventory Attributes",
      description: "Recorded against each segment — edited under Administration → Fields",
      fields: attributes.map((a) => ({
        key: `attribute.${a.code}`,
        label: a.unit ? `${a.label} (${a.unit})` : a.label,
        type: attrType(a.dataType),
        options:
          a.code === "MATERIAL"
            ? materials.map((m) => m.textValue).filter((s): s is string => !!s).sort()
            : undefined,
      })),
    },
    {
      key: "condition",
      label: "Condition",
      description: "Most recent condition measurement",
      fields: [
        { key: "condition.score", label: "WCI Score", type: "number" },
        { key: "condition.band", label: "Condition Band", type: "text" },
        { key: "condition.measuredOn", label: "Last Measured", type: "date" },
      ],
    },
    {
      key: "risk",
      label: "Risk",
      description: "Most recent risk assessment",
      fields: [
        { key: "risk.score", label: "Risk Score (1–25)", type: "number" },
        { key: "risk.pof", label: "Probability (1–5)", type: "number" },
        { key: "risk.cof", label: "Consequence (1–5)", type: "number" },
        { key: "risk.band", label: "Risk Band", type: "text", options: ["Low", "Moderate", "High", "Very High"] },
      ],
    },
    {
      key: "inspection",
      label: "Latest Inspection",
      description: "Answers from the most recent inspection of each segment",
      fields: [
        { key: "inspection.count", label: "Inspection Count", type: "number" },
        { key: "inspection.lastDate", label: "Last Inspected", type: "date" },
        ...inspectionFields.map((f) => ({
          key: `inspection.${f.code}`,
          label: f.unit ? `${f.label} (${f.unit})` : f.label,
          type: attrType(f.dataType),
        })),
      ],
    },
    {
      key: "failure",
      label: "Failures",
      description: "Recorded failure events",
      fields: [
        { key: "failure.count", label: "Failure Count", type: "number" },
        { key: "failure.lastDate", label: "Last Failure", type: "date" },
      ],
    },
  ];
}

/** One flat row per segment, keyed to match the schema above. */
export async function loadFilterRows(organizationId: string): Promise<FilterRow[]> {
  const [assets, bands] = await Promise.all([
    prisma.asset.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        location: true,
        attributeValues: { include: { definition: true } },
        conditionMeasurements: { orderBy: { measurementDate: "desc" }, take: 1 },
        riskAssessments: { orderBy: { assessmentDate: "desc" }, take: 1 },
        failureEvents: { orderBy: { failureDate: "desc" } },
        inspections: {
          orderBy: { inspectionDate: "desc" },
          take: 1,
          include: { results: { include: { field: true } } },
        },
        _count: { select: { inspections: true } },
      },
      orderBy: { assetCode: "asc" },
    }),
    getConditionBands(organizationId),
  ]);

  return assets.map((a) => {
    const row: FilterRow = {};
    const age = ageInYears(a.installationDate);
    const life = a.expectedUsefulLife ?? 75;

    row["asset.assetCode"] = a.assetCode;
    row["asset.name"] = a.name ?? null;
    row["asset.status"] = a.status;
    row["asset.installationDate"] = a.installationDate ? a.installationDate.toISOString().slice(0, 10) : null;
    row["asset.ageYears"] = age;
    row["asset.expectedUsefulLife"] = a.expectedUsefulLife ?? null;
    row["asset.ageRatio"] = age != null ? Math.round((age / life) * 100) : null;

    row["location.serviceArea"] = a.location?.serviceArea ?? null;
    row["location.pressureZone"] = a.location?.pressureZone ?? null;
    row["location.depth"] = a.location?.depth ?? null;

    for (const v of a.attributeValues) {
      const key = `attribute.${v.definition.code}`;
      row[key] =
        v.numberValue ??
        v.textValue ??
        (v.dateValue ? v.dateValue.toISOString().slice(0, 10) : null) ??
        v.booleanValue ??
        null;
    }

    const m = a.conditionMeasurements[0];
    row["condition.score"] = m ? Math.round(m.score * 10) / 10 : null;
    row["condition.band"] = m ? getConditionBand(m.score, bands).label : null;
    row["condition.measuredOn"] = m ? m.measurementDate.toISOString().slice(0, 10) : null;

    const r = a.riskAssessments[0];
    row["risk.score"] = r?.riskScore ?? null;
    row["risk.pof"] = r?.probabilityScore ?? null;
    row["risk.cof"] = r?.consequenceScore ?? null;
    row["risk.band"] = r ? getRiskBand(r.riskScore).label : null;

    row["inspection.count"] = a._count.inspections;
    const insp = a.inspections[0];
    row["inspection.lastDate"] = insp ? insp.inspectionDate.toISOString().slice(0, 10) : null;
    for (const res of insp?.results ?? []) {
      row[`inspection.${res.field.code}`] =
        res.numberValue ?? res.textValue ?? res.booleanValue ?? null;
    }

    row["failure.count"] = a.failureEvents.length;
    row["failure.lastDate"] = a.failureEvents[0]
      ? a.failureEvents[0].failureDate.toISOString().slice(0, 10)
      : null;

    return row;
  });
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Test one row against one criterion.
 *
 * A null field never satisfies a comparison — "condition < 25" must not be
 * true for a segment that has never been inspected. `is empty` is the only way
 * to select for absence, which keeps that intent explicit.
 */
function matches(row: FilterRow, c: Criterion, type: FieldType): boolean {
  const raw = row[c.field] ?? null;

  if (c.operator === "empty") return raw === null || raw === "";
  if (c.operator === "notEmpty") return raw !== null && raw !== "";
  if (raw === null || raw === "") return false;

  if (type === "number" || type === "date") {
    const a = type === "number" ? toNumber(raw) : Date.parse(String(raw));
    const b = type === "number" ? toNumber(c.value) : Date.parse(c.value);
    if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) return false;

    switch (c.operator) {
      case "eq": return a === b;
      case "ne": return a !== b;
      case "gt": return a > b;
      case "gte": return a >= b;
      case "lt": return a < b;
      case "lte": return a <= b;
      case "between": {
        const b2 = type === "number" ? toNumber(c.value2 ?? "") : Date.parse(c.value2 ?? "");
        if (b2 === null || Number.isNaN(b2)) return false;
        // Accept the bounds in either order rather than silently matching
        // nothing when someone types the larger number first.
        return a >= Math.min(b, b2) && a <= Math.max(b, b2);
      }
      case "in": return splitList(c.value).map(Number).includes(Number(a));
      case "nin": return !splitList(c.value).map(Number).includes(Number(a));
      default: return false;
    }
  }

  const text = String(raw).toLowerCase();
  const target = c.value.toLowerCase();
  switch (c.operator) {
    case "eq": return text === target;
    case "ne": return text !== target;
    case "contains": return text.includes(target);
    case "in": return splitList(target).includes(text);
    case "nin": return !splitList(target).includes(text);
    default: return false;
  }
}

export function applyCriteria(
  rows: FilterRow[],
  criteria: Criterion[],
  matchAll: boolean,
  typeByField: Map<string, FieldType>
): FilterRow[] {
  const usable = criteria.filter((c) => c.field && typeByField.has(c.field));
  if (usable.length === 0) return rows;

  return rows.filter((row) => {
    const results = usable.map((c) => matches(row, c, typeByField.get(c.field)!));
    return matchAll ? results.every(Boolean) : results.some(Boolean);
  });
}

export function fieldIndex(schema: FilterTable[]) {
  const byKey = new Map<string, FilterField>();
  for (const t of schema) for (const f of t.fields) byKey.set(f.key, f);
  return byKey;
}
