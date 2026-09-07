/**
 * The vocabulary of a filter: field shapes, operators and criteria.
 *
 * Separate from server/filter-schema.ts because the filter builder and the AI
 * assistant panel are client components that need the operator list and these
 * types, while filter-schema reaches the database. Importing one from the
 * other pulled the whole Prisma client into the browser bundle — harmless
 * while Prisma had a browser stub, a build failure once it carried
 * node-postgres with it.
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

/** Internal key holding the asset id on every row. Deliberately outside the
 * schema, so it cannot be selected as a column or reach a CSV export, but
 * available for turning a saved filter into a set of ids for a grid. */
export const ROW_ASSET_ID = "__assetId";

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
