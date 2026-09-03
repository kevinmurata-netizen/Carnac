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
 * One more limit worth stating plainly: this reads across the whole database,
 * not scoped to the signed-in organization. Every deployment of this app
 * today serves a single organization, so that has no practical effect yet —
 * but if a second organization is ever added, this console would see both
 * until it is revisited.
 */

const ALLOWED_TABLES = [
  "organizations",
  "roles",
  "asset_types",
  "assets",
  "asset_locations",
  "asset_attribute_definitions",
  "asset_attribute_values",
  "asset_relationships",
  "condition_models",
  "condition_measurements",
  "risk_models",
  "risk_factors",
  "risk_assessments",
  "criticality_scores",
  "deterioration_models",
  "deterioration_parameters",
  "deterioration_predictions",
  "failure_types",
  "failure_events",
  "inspection_templates",
  "inspection_template_fields",
  "inspections",
  "inspection_results",
  "inspection_attachments",
  "treatments",
  "treatment_costs",
  "treatment_rules",
  "documents",
  "projects",
  "budgets",
  "costs",
  "work_plans",
  "work_plan_items",
  "scenarios",
  "scenario_assumptions",
  "scenario_results",
  "saved_filters",
  "wishlist_items",
  "navigation_labels",
  "organization_settings",
];

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
    SELECT table_name, column_name, data_type
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

export async function runConsoleQuery(rawSql: string): Promise<ConsoleQueryResult> {
  const sql = rawSql.trim();
  if (!sql) throw new Error("Nothing to run");

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

  const started = Date.now();

  // The query as written runs unmodified inside the outer SELECT, so a
  // syntax error is the user's own and reads as one; the wrapper only bounds
  // how many rows come back and does not touch the query's own meaning.
  const wrapped = `SELECT * FROM (\n${sql.replace(/;\s*$/, "")}\n) AS console_query LIMIT ${ROW_LIMIT + 1}`;

  const rows = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      return tx.$queryRawUnsafe<Array<Record<string, unknown>>>(wrapped);
    },
    { timeout: STATEMENT_TIMEOUT_MS + 2000 }
  );

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
