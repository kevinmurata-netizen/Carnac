/**
 * Snapshots every code path that reaches Postgres through raw SQL.
 *
 * The Rust query engine and a driver adapter do not map Postgres types
 * identically — `::json` casts, `count(*)` coming back as BigInt, dates and
 * decimals are all places where a query keeps working but starts returning a
 * differently shaped JavaScript value. Nothing would throw; the map would just
 * stop drawing, or a dashboard count would render as "[object Object]".
 *
 * So: run this before the switch, run it after, diff the two files. Types are
 * recorded alongside values, because the values can match while the types do
 * not.
 *
 *   npm run qa:raw -- before.json
 *   ...switch to the driver adapter...
 *   npm run qa:raw -- after.json
 */

import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { getNetworkGeoJSON } from "../src/server/geo";
import { getConfigSummary, getDatabaseInfo, getRecentActivity } from "../src/server/admin";
import { runConsoleQuery, getConsoleSchema } from "../src/server/sql-console";

/** Records what a value IS, not only what it looks like once stringified — a
 * BigInt and a Number both print as 42. */
function describe(value: unknown, depth = 0): unknown {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  const t = typeof value;
  if (t === "bigint") return `bigint:${value}`;
  if (t === "number" || t === "boolean" || t === "string") return `${t}:${String(value).slice(0, 60)}`;
  if (value instanceof Date) return `date:${value.toISOString()}`;
  if (Array.isArray(value)) {
    if (depth > 2) return `array[${value.length}]`;
    return value.slice(0, 2).map((v) => describe(v, depth + 1));
  }
  if (t === "object") {
    // Query timing varies run to run and would report as a difference on
    // every comparison, drowning the ones that matter.
    if (value && typeof (value as Record<string, unknown>).elapsedMs === "number") {
      const { elapsedMs: _elapsed, ...rest } = value as Record<string, unknown>;
      return describe(rest, depth);
    }
    if (depth > 2) return "object";
    const o = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .slice(0, 25)
        .map((k) => [k, describe(o[k], depth + 1)])
    );
  }
  return t;
}

async function main() {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error("Usage: npm run qa:raw -- <output.json>");
    process.exit(1);
  }

  const org = await prisma.organization.findFirstOrThrow({ select: { id: true } });
  const snapshot: Record<string, unknown> = {};

  // PostGIS. ST_AsGeoJSON(...)::json is the single most adapter-sensitive
  // expression in the codebase: whether it arrives parsed or as a string
  // decides whether the map draws at all.
  const geo = await getNetworkGeoJSON(org.id, undefined, ["serviceArea", "material"]);
  snapshot["geo.featureCount"] = geo.features.length;
  snapshot["geo.firstFeature"] = describe(geo.features[0]);

  // Counts and table statistics — where count(*) turns into BigInt.
  snapshot["admin.configSummary"] = describe(await getConfigSummary(org.id));
  snapshot["admin.databaseInfo"] = describe(await getDatabaseInfo());
  snapshot["admin.recentActivity"] = describe((await getRecentActivity(org.id, 3)) ?? []);
  snapshot["sqlConsole.schema"] = describe(await getConsoleSchema());

  // The SQL console, which is $queryRawUnsafe with arbitrary user text.
  for (const [label, sql] of [
    ["count", "SELECT count(*) AS n FROM assets"],
    ["types", "SELECT 1::int AS i, 1.5::numeric AS num, '2020-01-01T00:00:00Z'::timestamptz AS ts, true AS b, '{\"a\":1}'::json AS j"],
    ["text", "SELECT \"assetCode\" FROM assets ORDER BY \"assetCode\" LIMIT 2"],
  ] as const) {
    try {
      snapshot[`sqlConsole.${label}`] = describe(await runConsoleQuery(sql));
    } catch (e) {
      snapshot[`sqlConsole.${label}`] = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // Straight through the ORM, as a control: if these move, something much
  // more fundamental has changed than type mapping.
  snapshot["orm.assetCount"] = await prisma.asset.count();
  snapshot["orm.firstAsset"] = describe(
    await prisma.asset.findFirst({ orderBy: { assetCode: "asc" }, select: { assetCode: true, installationDate: true } })
  );
  snapshot["orm.groupBy"] = describe(
    await prisma.asset.groupBy({ by: ["status"], _count: { _all: true }, orderBy: { status: "asc" } })
  );

  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`wrote ${Object.keys(snapshot).length} probes to ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
