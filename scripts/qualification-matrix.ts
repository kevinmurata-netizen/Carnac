/**
 * Dumps the qualification matrix: for every asset, which treatments the
 * engine considers applicable, and why not when it does not.
 *
 * This exists because the treatment model rebuild
 * (docs/TREATMENT-MODEL-REBUILD.md) moves applicability out of columns and
 * hard-coded gates and into stored rules. That migration is only correct if
 * exactly the same assets qualify for exactly the same treatments afterwards,
 * and nothing in the UI would show a drift of a few hundred rows out of six
 * thousand. So: run this before the migration, run it after, diff the files.
 *
 *   npm run qa:matrix -- before.json
 *   ...migrate...
 *   npm run qa:matrix -- after.json
 *   node -e "..."   (or any diff tool)
 *
 * A difference is not automatically a bug — Phase 1 deliberately converts
 * three hard-coded gates into rules an administrator can then edit — but every
 * difference has to be explainable before the change ships.
 */

import { writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { buildContexts } from "../src/server/treatments";
import { loadTreatmentDefs } from "../src/server/treatment-config";
import { isApplicable, estimateTreatmentCost, recommendTreatment } from "../src/domain/waterline/treatment";

type Matrix = {
  generatedAt: string;
  assetCount: number;
  treatmentCount: number;
  /** assetCode -> sorted treatment names considered applicable. */
  qualifies: Record<string, string[]>;
  /** How many assets each treatment qualified for — the quick eyeball. */
  totals: Record<string, number>;
  /** "assetCode|treatment" -> estimated cost. Phase 2 moves cost out of the
   * treatment's own columns and into rule-selected rates, and the same
   * before/after argument applies: the numbers must not move. */
  costs: Record<string, number>;
  costTotal: number;
  /** What the recommendation engine actually picks, and why. Phase 3 rewrites
   * the three loops that choose a treatment, so the choice AND its published
   * reasoning both have to survive unchanged. */
  recommended: Record<string, { treatment: string; cost: number; reasons: string[] }>;
};

async function main() {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error("Usage: npm run qa:matrix -- <output.json>");
    process.exit(1);
  }

  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error("No organization found");

  const [contexts, library] = await Promise.all([
    buildContexts(org.id),
    loadTreatmentDefs(org.id),
  ]);

  const qualifies: Record<string, string[]> = {};
  const totals: Record<string, number> = {};
  const costs: Record<string, number> = {};
  const recommended: Matrix["recommended"] = {};
  for (const def of library) totals[def.name] = 0;

  for (const { asset, ctx } of contexts) {
    const applicable = library.filter((def) => isApplicable(def, ctx));
    const names = applicable.map((def) => def.name).sort();
    qualifies[asset.assetCode] = names;
    for (const name of names) totals[name] = (totals[name] ?? 0) + 1;

    for (const def of applicable) {
      const cost = estimateTreatmentCost(def, ctx);
      if (cost != null) costs[`${asset.assetCode}|${def.name}`] = cost;
    }

    const rec = recommendTreatment(ctx, library);
    if (rec.recommended) {
      recommended[asset.assetCode] = {
        treatment: rec.recommended.name,
        cost: rec.recommended.estimatedCost,
        reasons: rec.recommended.reasons,
      };
    }
  }

  const matrix: Matrix = {
    generatedAt: new Date().toISOString(),
    assetCount: contexts.length,
    treatmentCount: library.length,
    // Sorted so two runs produce byte-comparable files rather than files that
    // differ only in the order the database happened to return rows.
    qualifies: Object.fromEntries(Object.entries(qualifies).sort(([a], [b]) => a.localeCompare(b))),
    totals: Object.fromEntries(Object.entries(totals).sort(([a], [b]) => a.localeCompare(b))),
    costs: Object.fromEntries(Object.entries(costs).sort(([a], [b]) => a.localeCompare(b))),
    costTotal: Object.values(costs).reduce((sum, c) => sum + c, 0),
    recommended: Object.fromEntries(Object.entries(recommended).sort(([a], [b]) => a.localeCompare(b))),
  };

  writeFileSync(outPath, JSON.stringify(matrix, null, 2));

  const pairs = Object.values(qualifies).reduce((n, list) => n + list.length, 0);
  console.log(`${org.name}: ${contexts.length} assets x ${library.length} treatments`);
  console.log(`${pairs} qualifying pairs written to ${outPath}`);
  console.log(`cost of every qualifying pair: $${matrix.costTotal.toLocaleString("en-US")}\n`);
  for (const [name, count] of Object.entries(matrix.totals)) {
    console.log(`  ${String(count).padStart(5)}  ${name}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
