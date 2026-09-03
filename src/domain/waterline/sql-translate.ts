import { getFilterSchema, type Criterion, type FieldType } from "@/server/filter-schema";
import { getConditionBands } from "@/server/settings";
import { RISK_BANDS } from "@/domain/waterline/risk";

/**
 * Renders a saved or AI-built filter as the SQL that produces the same rows.
 *
 * Nothing here ever runs against the database — the app never executes SQL to
 * answer a question, on purpose (see server/assistant.ts). This exists so
 * "what did that actually select" has a real, checkable answer instead of a
 * black box, and so a curious admin has a starting point to explore further in
 * the console rather than the criteria staying opaque.
 *
 * It mirrors server/filter-schema.ts's loadFilterRows field-by-field: the same
 * "latest measurement" pattern via DISTINCT ON, the same EAV joins for
 * attributes and inspection answers. Condition and risk bands are read from
 * the same source the app itself reads — the organization's configured
 * condition bands, and the fixed RISK_BANDS constant — rather than
 * reinvented here, so the generated SQL agrees with what the app shows.
 */

// installationDate is a timestamp, not a date, so a plain subtraction yields
// an interval rather than a number of days — hence the EXTRACT(EPOCH ...).
// Mirrors lib/format.ts's ageInYears: whole years between now and install.
const AGE_EXPR = `FLOOR(EXTRACT(EPOCH FROM (now() - a."installationDate")) / (365.25 * 86400))`;

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** A safe double-quoted SQL identifier for a column alias. */
function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** A CASE expression that reproduces getConditionBand/getRiskBand: highest
 * threshold wins, first match in the list going top to bottom. */
function bandCase(scoreExpr: string, bands: Array<{ min: number; label: string }>): string {
  const ordered = [...bands].sort((a, b) => b.min - a.min);
  const whens = ordered.map((b) => `WHEN ${scoreExpr} >= ${b.min} THEN ${quoteLiteral(b.label)}`).join("\n    ");
  const fallback = ordered[ordered.length - 1]?.label ?? "Unknown";
  return `CASE\n    ${whens}\n    ELSE ${quoteLiteral(fallback)}\n  END`;
}

type Source = { expr: string; type: FieldType; cte?: string };

/** Source SQL for one field. Undefined for a field this translator does not
 * cover — those criteria are left visible but unfiltered, listed in the
 * warnings the caller shows rather than silently dropped. */
function sourceFor(key: string): Source | undefined {
  switch (key) {
    case "asset.assetCode":
      return { expr: 'a."assetCode"', type: "text" };
    case "asset.name":
      return { expr: "a.name", type: "text" };
    case "asset.status":
      return { expr: "a.status::text", type: "text" };
    case "asset.installationDate":
      return { expr: 'a."installationDate"', type: "date" };
    case "asset.ageYears":
      return { expr: AGE_EXPR, type: "number" };
    case "asset.expectedUsefulLife":
      return { expr: 'a."expectedUsefulLife"', type: "number" };
    case "asset.ageRatio":
      return {
        expr: `ROUND(100.0 * ${AGE_EXPR} / NULLIF(COALESCE(a."expectedUsefulLife", 75), 0))`,
        type: "number",
      };
    case "location.serviceArea":
      return { expr: 'l."serviceArea"', type: "text", cte: "location" };
    case "location.pressureZone":
      return { expr: 'l."pressureZone"', type: "text", cte: "location" };
    case "location.depth":
      return { expr: "l.depth", type: "number", cte: "location" };
    case "condition.score":
      return { expr: "lc.score", type: "number", cte: "condition" };
    case "condition.band":
      return { expr: "lc.score", type: "number", cte: "condition" }; // band is derived — see below
    case "condition.measuredOn":
      return { expr: 'lc."measurementDate"', type: "date", cte: "condition" };
    case "risk.score":
      return { expr: 'lr."riskScore"', type: "number", cte: "risk" };
    case "risk.pof":
      return { expr: 'lr."probabilityScore"', type: "number", cte: "risk" };
    case "risk.cof":
      return { expr: 'lr."consequenceScore"', type: "number", cte: "risk" };
    case "risk.band":
      return { expr: 'lr."riskScore"', type: "number", cte: "risk" }; // band is derived — see below
    case "failure.count":
      return { expr: "COALESCE(fl.failure_count, 0)", type: "number", cte: "failure" };
    case "failure.lastDate":
      return { expr: "fl.last_failure", type: "date", cte: "failure" };
    case "inspection.count":
      return { expr: "COALESCE(ic.inspection_count, 0)", type: "number", cte: "inspection_counts" };
    case "inspection.lastDate":
      return { expr: "ic.last_inspection", type: "date", cte: "inspection_counts" };
    default:
      if (key.startsWith("attribute.")) {
        const code = key.slice("attribute.".length);
        return { expr: `attr_${code}.value`, type: "text", cte: `attr:${code}` };
      }
      if (key.startsWith("inspection.")) {
        const code = key.slice("inspection.".length);
        return { expr: `insp_${code}.value`, type: "text", cte: `insp:${code}` };
      }
      return undefined;
  }
}

function conditionOf(expr: string, type: FieldType, criterion: Criterion): string | null {
  const numeric = type === "number";
  const dateCast = type === "date" ? "::date" : "";
  const lit = (raw: string) => (numeric ? raw : `${quoteLiteral(raw)}${dateCast}`);

  switch (criterion.operator) {
    case "eq":
      return `${expr} = ${lit(criterion.value)}`;
    case "ne":
      return `${expr} <> ${lit(criterion.value)}`;
    case "gt":
      return `${expr} > ${lit(criterion.value)}`;
    case "gte":
      return `${expr} >= ${lit(criterion.value)}`;
    case "lt":
      return `${expr} < ${lit(criterion.value)}`;
    case "lte":
      return `${expr} <= ${lit(criterion.value)}`;
    case "between":
      return `${expr} BETWEEN ${lit(criterion.value)} AND ${lit(criterion.value2 ?? criterion.value)}`;
    case "in": {
      const list = criterion.value.split(",").map((v) => v.trim()).filter(Boolean);
      if (list.length === 0) return null;
      return `${expr} IN (${list.map((v) => (numeric ? v : quoteLiteral(v))).join(", ")})`;
    }
    case "nin": {
      const list = criterion.value.split(",").map((v) => v.trim()).filter(Boolean);
      if (list.length === 0) return null;
      return `${expr} NOT IN (${list.map((v) => (numeric ? v : quoteLiteral(v))).join(", ")})`;
    }
    case "contains":
      return `${expr} ILIKE ${quoteLiteral(`%${criterion.value}%`)}`;
    case "empty":
      return `${expr} IS NULL`;
    case "notEmpty":
      return `${expr} IS NOT NULL`;
    default:
      return null;
  }
}

export async function translateToSql(
  organizationId: string,
  columns: string[],
  criteria: Criterion[],
  matchAll: boolean
): Promise<{ sql: string; unsupported: string[] }> {
  const [schema, conditionBands] = await Promise.all([
    getFilterSchema(organizationId),
    getConditionBands(organizationId),
  ]);
  const typeByKey = new Map(schema.flatMap((t) => t.fields.map((f) => [f.key, f.type] as const)));
  const labelByKey = new Map(schema.flatMap((t) => t.fields.map((f) => [f.key, f.label] as const)));

  const conditionBandCase = bandCase("lc.score", conditionBands);
  const riskBandCase = bandCase("lr.\"riskScore\"", RISK_BANDS);

  const wanted = new Set([...columns, ...criteria.map((c) => c.field)]);
  const unsupported: string[] = [];

  const ctes = new Map<string, string>();
  const joins = new Map<string, string>();

  const need = (name: string, cteSql: string | null, joinSql: string | null) => {
    if (cteSql && !ctes.has(name)) ctes.set(name, cteSql);
    if (joinSql && !joins.has(name)) joins.set(name, joinSql);
  };

  const registerAttribute = (code: string) => {
    const fieldType = typeByKey.get(`attribute.${code}`) ?? "text";
    const column =
      fieldType === "number" ? "numberValue" : fieldType === "date" ? "dateValue" : fieldType === "boolean" ? "booleanValue" : "textValue";
    need(
      `attr:${code}`,
      `attr_${code} AS (\n  SELECT av."assetId", av."${column}" AS value\n  FROM asset_attribute_values av\n  JOIN asset_attribute_definitions d ON d.id = av."definitionId"\n  WHERE d.code = ${quoteLiteral(code)}\n)`,
      `LEFT JOIN attr_${code} ON attr_${code}."assetId" = a.id`
    );
    return fieldType;
  };

  const registerInspectionField = (code: string) => {
    const fieldType = typeByKey.get(`inspection.${code}`) ?? "text";
    const column =
      fieldType === "number" ? "numberValue" : fieldType === "date" ? "dateValue" : fieldType === "boolean" ? "booleanValue" : "textValue";
    need(
      "latest_inspection",
      `latest_inspection AS (\n  SELECT DISTINCT ON (i."assetId") i."assetId", i.id AS inspection_id\n  FROM inspections i\n  ORDER BY i."assetId", i."inspectionDate" DESC\n)`,
      null
    );
    need(
      `insp:${code}`,
      `insp_${code} AS (\n  SELECT li."assetId", ir."${column}" AS value\n  FROM latest_inspection li\n  JOIN inspection_results ir ON ir."inspectionId" = li.inspection_id\n  JOIN inspection_template_fields f ON f.id = ir."fieldId" AND f.code = ${quoteLiteral(code)}\n)`,
      `LEFT JOIN insp_${code} ON insp_${code}."assetId" = a.id`
    );
    return fieldType;
  };

  // Actual type per field, resolved once — the schema's real type for
  // dynamic attribute/inspection fields, the fixed type from sourceFor for
  // everything else.
  const resolvedType = new Map<string, FieldType>();

  for (const key of wanted) {
    const source = sourceFor(key);
    if (!source) {
      unsupported.push(labelByKey.get(key) ?? key);
      continue;
    }

    let type = source.type;

    if (source.cte === "location") {
      need("location", null, 'LEFT JOIN asset_locations l ON l."assetId" = a.id');
    } else if (source.cte === "condition") {
      need(
        "condition",
        `latest_condition AS (\n  SELECT DISTINCT ON (cm."assetId") cm."assetId", cm.score, cm."measurementDate"\n  FROM condition_measurements cm\n  ORDER BY cm."assetId", cm."measurementDate" DESC\n)`,
        'LEFT JOIN latest_condition lc ON lc."assetId" = a.id'
      );
    } else if (source.cte === "risk") {
      need(
        "risk",
        `latest_risk AS (\n  SELECT DISTINCT ON (ra."assetId") ra."assetId", ra."riskScore", ra."probabilityScore", ra."consequenceScore"\n  FROM risk_assessments ra\n  ORDER BY ra."assetId", ra."assessmentDate" DESC\n)`,
        'LEFT JOIN latest_risk lr ON lr."assetId" = a.id'
      );
    } else if (source.cte === "failure") {
      need(
        "failure",
        `failures AS (\n  SELECT "assetId", COUNT(*) AS failure_count, MAX("failureDate") AS last_failure\n  FROM failure_events\n  GROUP BY "assetId"\n)`,
        'LEFT JOIN failures fl ON fl."assetId" = a.id'
      );
    } else if (source.cte === "inspection_counts") {
      need(
        "inspection_counts",
        `inspection_counts AS (\n  SELECT "assetId", COUNT(*) AS inspection_count, MAX("inspectionDate") AS last_inspection\n  FROM inspections\n  GROUP BY "assetId"\n)`,
        'LEFT JOIN inspection_counts ic ON ic."assetId" = a.id'
      );
    } else if (source.cte?.startsWith("attr:")) {
      type = registerAttribute(source.cte.slice("attr:".length));
    } else if (source.cte?.startsWith("insp:")) {
      type = registerInspectionField(source.cte.slice("insp:".length));
    }

    resolvedType.set(key, type);
  }

  const exprFor = (key: string): string => {
    if (key === "condition.band") return conditionBandCase;
    if (key === "risk.band") return riskBandCase;
    return sourceFor(key)!.expr;
  };

  const whereParts: string[] = [];
  for (const criterion of criteria) {
    if (!sourceFor(criterion.field)) continue;
    // Band fields are text derived from a numeric score, so filtering on them
    // compares the CASE expression itself rather than the raw score.
    const type: FieldType =
      criterion.field === "condition.band" || criterion.field === "risk.band"
        ? "text"
        : (typeByKey.get(criterion.field) ?? resolvedType.get(criterion.field) ?? "text");
    const clause = conditionOf(exprFor(criterion.field), type, criterion);
    if (clause) whereParts.push(clause);
  }

  const selectList = columns
    .map((key) => (sourceFor(key) ? `  ${exprFor(key)} AS ${quoteIdent(labelByKey.get(key) ?? key)}` : null))
    .filter((s): s is string => s !== null);

  const finalSelect = selectList.length > 0 ? selectList.join(",\n") : '  a."assetCode"';
  const cteBlock = ctes.size > 0 ? `WITH ${[...ctes.values()].join(",\n")}\n` : "";
  const joinBlock = [...joins.values()].join("\n");
  const whereBlock =
    whereParts.length > 0 ? `\n  AND (${whereParts.join(matchAll ? "\n   AND " : "\n   OR ")})` : "";

  const sql =
    `${cteBlock}SELECT\n${finalSelect}\n` +
    `FROM assets a\n${joinBlock ? joinBlock + "\n" : ""}` +
    `WHERE a."organizationId" = ${quoteLiteral(organizationId)}\n  AND a."deletedAt" IS NULL${whereBlock}\n` +
    `ORDER BY a."assetCode";`;

  return { sql, unsupported: [...new Set(unsupported)] };
}
