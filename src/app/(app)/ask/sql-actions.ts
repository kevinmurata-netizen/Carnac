"use server";

import { auth } from "@/lib/auth";
import { getConsoleSchema, runConsoleQuery, type ConsoleTable, type ConsoleQueryResult } from "@/server/sql-console";
import { translateToSql } from "@/domain/waterline/sql-translate";
import type { Criterion } from "@/server/filter-schema";

/**
 * The SQL console's server side.
 *
 * Gated to Administrator, same bar as Decision Trees and the map settings —
 * this reads the database directly rather than through the curated grids, so
 * it gets the same trust level as the other tools that bypass the app's usual
 * screens.
 */
async function requireAdministrator() {
  const session = await auth();
  if (!session || session.user.roleName !== "Administrator") {
    throw new Error("The SQL console is available to Administrators only");
  }
  return session;
}

export type SqlRunResult = ({ ok: true } & ConsoleQueryResult) | { ok: false; message: string };

export async function getSqlSchemaAction(): Promise<ConsoleTable[]> {
  await requireAdministrator();
  return getConsoleSchema();
}

export async function runSqlAction(sql: string): Promise<SqlRunResult> {
  try {
    await requireAdministrator();
    const result = await runConsoleQuery(sql);
    return { ok: true, ...result };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not run that query" };
  }
}

export type TranslateResult = { sql: string; unsupported: string[] } | { error: string };

/**
 * The SQL a set of criteria is equivalent to.
 *
 * Translation only reads configuration (the field schema, condition bands) —
 * it does not touch asset data — so it is available to whoever asked the
 * question, not gated to Administrator. Running the result is what needs the
 * higher bar, and runSqlAction enforces that separately.
 */
export async function translateToSqlAction(
  columns: string[],
  criteria: Criterion[],
  matchAll: boolean
): Promise<TranslateResult> {
  try {
    const session = await auth();
    if (!session) throw new Error("Sign in first");
    return await translateToSql(session.user.organizationId, columns, criteria, matchAll);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not translate that filter" };
  }
}
