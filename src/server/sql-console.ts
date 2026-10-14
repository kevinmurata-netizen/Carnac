import { prisma } from "@/lib/prisma";

/**
 * A read-only SQL console against the real database, for Administrators.
 *
 * What actually enforces "read-only" is Postgres itself: every query runs
 * inside a transaction issued `SET TRANSACTION READ ONLY`, which the engine
 * rejects any write against — verified directly, not assumed. Everything else
 * here (the single-statement check, the keyword blocklist, the table
 * allowlist) is a second layer on top of that, not a substitute for it.
 *
 * Table access is allow-listed, not blocked. `users` is not on the list at
 * all — the only column in this database worth protecting lives there, and
 * omitting the table entirely is a stronger guarantee than trying to strip
 * one column out of an arbitrary query. Administrators already manage users
 * from Settings → Administration → Users & Roles; this console adds no
 * legitimate reason to reach the table directly.
 *
 * Read this for what it is: a deterrent against mistakes and a genuine
 * transaction-level block on writes, not a defence against an Administrator
 * who is determined to misuse credentials they already hold to your
 * production database. That threat model is out of scope for an in-app
 * feature — it is a people-and-access-policy problem.
 *
 * Every query reads only the signed-in organization's rows. Before it runs,
 * each table it names is shadowed by a temporary view of the same name that
 * keeps to the organization — directly, through its asset type or asset, or
 * through the record it belongs to — and Postgres resolves an unqualified
 * name to the temporary view first. The transaction is then rolled back, so
 * the views never outlive the query. Schema-qualified names and system
 * catalogs are refused, so nothing reaches the tables underneath.
 */

/** "Belongs to this organization", per table: a WHERE clause over the table's
 * own columns, with ORG standing for the organization's id. A table absent
 * here is not available in the console. */
const ASSETS = `SELECT "id" FROM public."assets" WHERE "organizationId" = ORG`;
const TYPES = `SELECT "id" FROM public."asset_types" WHERE "organizationId" = ORG`;
const SCOPES: Record<string, string> = {
  organizations: `"id" = ORG`,
  roles: "TRUE",
  asset_types: `"organizationId" = ORG`,
  assets: `"organizationId" = ORG`,
  asset_locations: `"assetId" IN (${ASSETS})`,
  asset_attribute_definitions: `"assetTypeId" IN (${TYPES})`,
  asset_attribute_values: `"assetId" IN (${ASSETS})`,
  asset_relationships: `"assetAId" IN (${ASSETS})`,
  condition_models: `"assetTypeId" IN (${TYPES})`,
  condition_measurements: `"assetId" IN (${ASSETS})`,
  risk_models: `"assetTypeId" IN (${TYPES})`,
  risk_factors: `"riskAssessmentId" IN (SELECT "id" FROM public."risk_assessments" WHERE "assetId" IN (${ASSETS}))`,
  risk_assessments: `"assetId" IN (${ASSETS})`,
  criticality_scores: `"assetId" IN (${ASSETS})`,
  deterioration_models: `"assetTypeId" IN (${TYPES})`,
  deterioration_parameters: `"modelId" IN (SELECT "id" FROM public."deterioration_models" WHERE "assetTypeId" IN (${TYPES}))`,
  deterioration_predictions: `"assetId" IN (${ASSETS})`,
  failure_types: `"assetTypeId" IN (${TYPES})`,
  failure_events: `"assetId" IN (${ASSETS})`,
  inspection_templates: `"assetTypeId" IN (${TYPES})`,
  inspection_template_fields: `"templateId" IN (SELECT "id" FROM public."inspection_templates" WHERE "assetTypeId" IN (${TYPES}))`,
  inspections: `"assetId" IN (${ASSETS})`,
  inspection_results: `"inspectionId" IN (SELECT "id" FROM public."inspections" WHERE "assetId" IN (${ASSETS}))`,
  inspection_attachments: `"inspectionId" IN (SELECT "id" FROM public."inspections" WHERE "assetId" IN (${ASSETS}))`,
  treatments: `"assetTypeId" IN (${TYPES})`,
  documents: `"assetId" IN (${ASSETS})`,
  budgets: `"organizationId" = ORG`,
  projects: `"budgetId" IN (SELECT "id" FROM public."budgets" WHERE "organizationId" = ORG)`,
  costs: `"projectId" IN (SELECT "id" FROM public."projects" WHERE "budgetId" IN (SELECT "id" FROM public."budgets" WHERE "organizationId" = ORG))`,
  work_plans: `"organizationId" = ORG`,
  work_plan_items: `"workPlanId" IN (SELECT "id" FROM public."work_plans" WHERE "organizationId" = ORG)`,
  scenarios: `"organizationId" = ORG`,
  scenario_assumptions: `"scenarioId" IN (SELECT "id" FROM public."scenarios" WHERE "organizationId" = ORG)`,
  scenario_results: `"scenarioId" IN (SELECT "id" FROM public."scenarios" WHERE "organizationId" = ORG)`,
  saved_filters: `"organizationId" = ORG`,
  wishlist_items: `"organizationId" = ORG`,
  navigation_labels: `"organizationId" = ORG`,
  organization_settings: `"organizationId" = ORG`,
};

/** In reading order: assets and what hangs off them first, reference data last. */
const ALLOWED_TABLES = Object.keys(SCOPES);

// Defence in depth beyond excluding `users`: no allowed table may ever gain a
// column matching one of these names without the console silently exposing
// it. Checked against the live schema, not trusted to stay true by omission.
const FORBIDDEN_COLUMN_PATTERN = /password|secret|token|api[_-]?key|credential/i;

export type ConsoleTable = {
  name: string;
  columns: Array<{ name: string; dataType: string }>;
};

/** The schema the console shows and permits, read live from Postgres so it
 * never drifts from what the database actually has. */
export async function getConsoleSchema(): Promise<ConsoleTable[]> {
  const rows = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string; data_type: string }>
  >`
    -- Cast to text explicitly. information_schema columns are the "name"
    -- domain, which the driver adapter refuses to deserialize
    -- (UnsupportedNativeDataType) where the old Rust engine coerced it
    -- silently. Ordering is unaffected: both are collated the same way.
    SELECT table_name::text AS table_name,
           column_name::text AS column_name,
           data_type::text AS data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY(${ALLOWED_TABLES})
    ORDER BY table_name, ordinal_position
  `;

  const byTable = new Map<string, ConsoleTable>();
  for (const row of rows) {
    if (FORBIDDEN_COLUMN_PATTERN.test(row.column_name)) continue;
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, { name: row.table_name, columns: [] });
    byTable.get(row.table_name)!.columns.push({ name: row.column_name, dataType: row.data_type });
  }

  // In the fixed order above, not alphabetical — assets and the tables that
  // hang off it first, reference data last, which is the order someone
  // exploring the schema actually wants to read it in.
  return ALLOWED_TABLES.map((name) => byTable.get(name)).filter((t): t is ConsoleTable => !!t);
}

const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "grant",
  "revoke",
  "truncate",
  "copy",
  "call",
  "do",
  "execute",
  "vacuum",
  "reindex",
  "cluster",
  "listen",
  "notify",
  "unlisten",
  "lock",
  "set",
  "reset",
  "begin",
  "commit",
  "rollback",
  "savepoint",
  "prepare",
  "deallocate",
  "comment",
  "merge",
  "refresh",
  "security",
  "explain",
  "into", // "SELECT ... INTO new_table" creates a table — a write in SELECT's clothing.
];

/** Strips string literals and comments before any keyword or table scan, so
 * a semicolon or a forbidden word sitting inside a quoted value or a comment
 * cannot smuggle a query past the checks below. What is left over is
 * approximate SQL structure, not a full parse — good enough to decide
 * allow/deny, not good enough to claim it understands the query. */
function stripLiteralsAndComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

export type ConsoleQueryResult = {
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  rowCount: number;
  truncated: boolean;
  elapsedMs: number;
};

const ROW_LIMIT = 500;
const STATEMENT_TIMEOUT_MS = 8000;

/** Every table in the database, read once: a query naming one the console
 * does not offer is refused wherever the name appears — after a comma as
 * much as after FROM or JOIN — and one naming a schema is refused outright. */
let names: Promise<{ tables: Set<string>; schemas: Set<string> }> | null = null;
function databaseNames() {
  names ??= Promise.all([
    prisma.$queryRaw<Array<{ name: string }>>`
      SELECT table_name::text AS name FROM information_schema.tables WHERE table_schema = 'public'
    `,
    prisma.$queryRaw<Array<{ name: string }>>`SELECT schema_name::text AS name FROM information_schema.schemata`,
  ]).then(([tables, schemas]) => ({
    tables: new Set(tables.map((r) => r.name.toLowerCase())),
    schemas: new Set(schemas.map((r) => r.name.toLowerCase())),
  }));
  return names;
}

/** Carries a finished query's rows out of the transaction that is then
 * rolled back, taking its temporary views with it. */
class Finished {
  constructor(readonly rows: Array<Record<string, unknown>>) {}
}

export async function runConsoleQuery(organizationId: string, rawSql: string): Promise<ConsoleQueryResult> {
  const sql = rawSql.trim();
  if (!sql) throw new Error("Nothing to run");
  // Inlined into the views below, so it must be exactly an id.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(organizationId)) throw new Error("Unknown organization");

  const stripped = stripLiteralsAndComments(sql);

  // Exactly one statement. A trailing semicolon is fine; anything after one
  // that is not blank is a second statement and is refused outright, since
  // the point of the checks below is to look at "the query" — plural
  // statements defeat that on their own.
  const withoutTrailing = stripped.replace(/;\s*$/, "");
  if (/;/.test(withoutTrailing)) {
    throw new Error("Only a single statement is allowed — remove the extra semicolon");
  }

  if (!/^\s*(select|with)\b/i.test(stripped)) {
    throw new Error("Only SELECT (or WITH ... SELECT) statements are allowed");
  }

  for (const word of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${word}\\b`, "i").test(stripped)) {
      throw new Error(`"${word.toUpperCase()}" is not allowed in the console`);
    }
  }

  // A blunt backstop for the one table that must never be reachable here:
  // the word is refused anywhere in the query, not just where a table name
  // would normally appear, because a partial parser is exactly the kind of
  // thing worth being blunt around rather than clever around.
  if (/\busers\b/i.test(stripped)) {
    throw new Error('The "users" table is not available in this console');
  }

  // Names the query defines itself via WITH are legitimate FROM/JOIN targets
  // even though they are not real tables, so they are exempted from the
  // allowlist check rather than mistaken for an unknown table.
  // `\b` before the comma branch would silently never match — a word boundary
  // needs a word/non-word transition, and ")," is non-word on both sides — so
  // "with" gets its own \b and the comma does not need one.
  const cteNames = [...stripped.matchAll(/(?:\bwith\b|,)\s+"?([a-z_][a-z0-9_]*)"?\s+as\s*\(/gi)].map((m) =>
    m[1].toLowerCase()
  );

  const referenced = [...stripped.matchAll(/\b(?:from|join)\s+"?([a-z_][a-z0-9_]*)"?/gi)].map((m) =>
    m[1].toLowerCase()
  );
  const unknown = referenced.filter((name) => !ALLOWED_TABLES.includes(name) && !cteNames.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Table not available here: ${[...new Set(unknown)].join(", ")}`);
  }

  // Only the organization's own rows. Nothing may name a schema or a system
  // catalog, so no table is reached except by its plain name; any other
  // table the console does not offer is refused wherever its name appears,
  // even as a name the query gives its own CTE; and every offered table
  // named anywhere is shadowed by its organization's view — a CTE of the
  // same name included, since its own definition would read the table.
  const words = new Set((stripped.match(/[a-z_][a-z0-9_]*/gi) ?? []).map((w) => w.toLowerCase()));
  const { tables, schemas } = await databaseNames();
  if ([...words].some((w) => schemas.has(w) || w.startsWith("pg_"))) {
    throw new Error("Name tables plainly — schema names and system catalogs are not available here");
  }
  const outside = [...words].filter((w) => tables.has(w) && !ALLOWED_TABLES.includes(w));
  if (outside.length > 0) {
    throw new Error(`Table not available here: ${outside.join(", ")}`);
  }
  const scoped = ALLOWED_TABLES.filter((t) => words.has(t));

  const started = Date.now();

  // The query as written runs unmodified inside the outer SELECT, so a
  // syntax error is the user's own and reads as one; the wrapper only bounds
  // how many rows come back and does not touch the query's own meaning.
  const wrapped = `SELECT * FROM (\n${sql.replace(/;\s*$/, "")}\n) AS console_query LIMIT ${ROW_LIMIT + 1}`;

  const org = `'${organizationId}'`;
  let rows: Array<Record<string, unknown>>;
  try {
    await prisma.$transaction(
      async (tx) => {
        // Each named table shadowed by its organization's rows, before the
        // transaction turns read-only — after which it can create nothing.
        for (const table of scoped) {
          await tx.$executeRawUnsafe(
            `CREATE TEMP VIEW "${table}" AS SELECT * FROM public."${table}" WHERE ${SCOPES[table].replaceAll("ORG", org)}`
          );
        }
        await tx.$executeRawUnsafe("SET LOCAL transaction_read_only = on");
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
        throw new Finished(await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(wrapped));
      },
      { timeout: STATEMENT_TIMEOUT_MS + 4000 }
    );
    throw new Error("The query did not finish");
  } catch (e) {
    if (!(e instanceof Finished)) throw e;
    rows = e.rows;
  }

  const truncated = rows.length > ROW_LIMIT;
  const page = truncated ? rows.slice(0, ROW_LIMIT) : rows;
  const columns = page.length > 0 ? Object.keys(page[0]) : [];

  return {
    columns,
    rows: page.map((row) => Object.fromEntries(columns.map((c) => [c, serializeCell(row[c])]))),
    rowCount: page.length,
    truncated,
    elapsedMs: Date.now() - started,
  };
}

/** Every value has to survive JSON over the wire to a client component —
 * bigint and Date do not by default. */
function serializeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}
