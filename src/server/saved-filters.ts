import { prisma } from "@/lib/prisma";
import {
  applyCriteria,
  fieldIndex,
  getFilterSchema,
  loadFilterRows,
  OPERATORS,
  type Criterion,
  type FilterRow,
} from "@/server/filter-schema";

export type SavedFilterRow = {
  id: string;
  name: string;
  description: string | null;
  fields: string[];
  criteria: Criterion[];
  matchAll: boolean;
  createdByName: string | null;
  updatedAt: Date;
};

function parseFields(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

const OPERATOR_KEYS = new Set(OPERATORS.map((o) => o.key as string));

/** Criteria are stored as JSON, so they are validated on the way out rather
 * than trusted — a hand-edited row should not break the page. */
function parseCriteria(value: unknown): Criterion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    if (typeof o.field !== "string" || typeof o.operator !== "string") return [];
    if (!OPERATOR_KEYS.has(o.operator)) return [];
    return [
      {
        field: o.field,
        operator: o.operator as Criterion["operator"],
        value: typeof o.value === "string" ? o.value : "",
        value2: typeof o.value2 === "string" ? o.value2 : undefined,
      },
    ];
  });
}

export async function listSavedFilters(organizationId: string): Promise<SavedFilterRow[]> {
  const rows = await prisma.savedFilter.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    fields: parseFields(r.fields),
    criteria: parseCriteria(r.criteria),
    matchAll: r.matchAll,
    createdByName: r.createdByName,
    updatedAt: r.updatedAt,
  }));
}

export type FilterDefinition = {
  name: string;
  description: string | null;
  fields: string[];
  criteria: Criterion[];
  matchAll: boolean;
};

async function validate(organizationId: string, input: FilterDefinition) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the filter a name");
  if (input.fields.length === 0) throw new Error("Select at least one field to show");

  // Only fields that exist in the schema are stored, so a filter cannot carry a
  // reference to something that was since removed under Administration.
  const known = fieldIndex(await getFilterSchema(organizationId));
  const unknownField = input.fields.find((f) => !known.has(f));
  if (unknownField) throw new Error(`"${unknownField}" is not a field you can select`);

  for (const c of input.criteria) {
    if (!known.has(c.field)) throw new Error(`Criterion refers to an unknown field: ${c.field}`);
    const spec = OPERATORS.find((o) => o.key === c.operator);
    if (!spec) throw new Error(`Unknown comparison: ${c.operator}`);
    if (spec.values >= 1 && !c.value.trim()) {
      throw new Error(`"${known.get(c.field)!.label} ${spec.label}" needs a value`);
    }
    if (spec.values === 2 && !c.value2?.trim()) {
      throw new Error(`"${known.get(c.field)!.label} between" needs both ends of the range`);
    }
  }
  return name;
}

export async function createSavedFilter(
  organizationId: string,
  input: FilterDefinition & { createdByName: string | null }
) {
  const name = await validate(organizationId, input);

  const clash = await prisma.savedFilter.findFirst({ where: { organizationId, name } });
  if (clash) throw new Error(`A filter named "${name}" already exists`);

  await prisma.savedFilter.create({
    data: {
      organizationId,
      name,
      description: input.description?.trim() || null,
      fields: input.fields,
      criteria: input.criteria as unknown as object[],
      matchAll: input.matchAll,
      createdByName: input.createdByName,
    },
  });
}

export async function updateSavedFilter(organizationId: string, id: string, input: FilterDefinition) {
  const name = await validate(organizationId, input);

  const existing = await prisma.savedFilter.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("That filter no longer exists");

  const clash = await prisma.savedFilter.findFirst({
    where: { organizationId, name, id: { not: id } },
  });
  if (clash) throw new Error(`Another filter is already named "${name}"`);

  await prisma.savedFilter.update({
    where: { id },
    data: {
      name,
      description: input.description?.trim() || null,
      fields: input.fields,
      criteria: input.criteria as unknown as object[],
      matchAll: input.matchAll,
    },
  });
}

export async function deleteSavedFilter(organizationId: string, id: string) {
  const existing = await prisma.savedFilter.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("That filter no longer exists");
  await prisma.savedFilter.delete({ where: { id } });
}

export type FilterResult = {
  columns: Array<{ key: string; label: string }>;
  rows: FilterRow[];
  matched: number;
  total: number;
};

/** Run a definition and return the projected rows, in the field order given. */
export async function runFilter(
  organizationId: string,
  fields: string[],
  criteria: Criterion[],
  matchAll: boolean,
  limit = 500
): Promise<FilterResult> {
  const [schema, allRows] = await Promise.all([
    getFilterSchema(organizationId),
    loadFilterRows(organizationId),
  ]);

  const known = fieldIndex(schema);
  const typeByField = new Map([...known].map(([k, f]) => [k, f.type]));
  const columns = fields.filter((f) => known.has(f)).map((f) => ({ key: f, label: known.get(f)!.label }));

  const matched = applyCriteria(allRows, criteria, matchAll, typeByField);

  return {
    columns,
    // Project to the selected fields, in the order the user arranged them.
    rows: matched.slice(0, limit).map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key] ?? null]))),
    matched: matched.length,
    total: allRows.length,
  };
}

export function toCsv(result: FilterResult): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    result.columns.map((c) => escape(c.label)).join(","),
    ...result.rows.map((r) => result.columns.map((c) => escape(r[c.key])).join(",")),
  ].join("\n");
}
