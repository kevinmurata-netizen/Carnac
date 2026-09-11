import { prisma } from "@/lib/prisma";
import { rankOptions } from "@/server/priority";
import { listCategoryWeightSets } from "@/server/category-weight-sets";
import { listFundingPlans } from "@/server/category-funding";
import { buildSimAssets } from "@/server/scenarios";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { runScenario, DEFAULT_ASSUMPTIONS } from "@/domain/waterline/scenario";
import { loadCombinations } from "@/server/combinations";
import { getMaterialCurves } from "@/server/settings";

/**
 * What the Priority Score actually ranks, measured against the real network.
 *
 *   npm run qa:priority
 *
 * The formula (docs/TREATMENT-MODEL-REBUILD.md §5.4) divides by total cost, and
 * dividing by cost has a consequence that is only visible at network scale:
 * cost varies far more between categories than benefit does, so cheap work wins
 * by roughly the ratio of those two spreads. This prints the numbers rather
 * than arguing about them — the category mix at the top of the ranking, where
 * the first renewal appears, and the median cost, benefit and priority per
 * category.
 *
 * Re-run it after changing a benefit weighting, a category weighting or the
 * scale factor. If the top of the ranking is one category, the ranking is
 * telling you about the cost spread, not about the network.
 */

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error("No organization in this database");

  console.log(`Priority ranking — ${org.name}\n`);

  const base = await rankOptions(org.id);
  console.log(
    `${base.optionsScored} options over ${base.assetsWithOptions} assets ` +
      `(${base.combinationsScored} combinations), ${base.unpriced} unpriced, ${base.ms} ms`
  );
  console.log(
    `benefit weighting: ${base.weightSetName} · categories: ${base.categoryWeightSetName} · ` +
      `scale factor: ${base.scaleFactorName ?? "none active"} (${base.scaleFactorFallbacks} fell back to 1)`
  );
  if (base.excludedCategories.length > 0) {
    console.log(`excluded by category weight: ${base.excludedCategories.join(", ")}`);
  }

  console.log("\nTop 10:");
  for (const row of base.rows.filter((r) => r.eligible).slice(0, 10)) {
    console.log(
      `  ${String(row.priority).padStart(10)}  ${row.assetCode}  ${row.optionLabel.padEnd(24)}` +
        `${row.category.padEnd(13)} ${money(row.totalCost).padStart(11)}  benefit ${String(row.expectedBenefit).padStart(5)}` +
        `${row.isCombination ? "  [combination]" : ""}${row.isRecommended ? "  [recommended]" : ""}`
    );
  }

  console.log("\nPer category, across every option:");
  const categories = [...new Set(base.rows.map((r) => r.category))];
  for (const cat of categories) {
    const rows = base.rows.filter((r) => r.category === cat && r.eligible);
    console.log(
      `  ${cat.padEnd(13)} ${String(rows.length).padStart(5)} options · median cost ${money(
        median(rows.map((r) => r.totalCost))
      ).padStart(11)} · median benefit ${String(median(rows.map((r) => r.expectedBenefit))).padStart(5)} · median priority ${median(
        rows.map((r) => r.priority ?? 0)
      )}`
    );
  }

  console.log("\nWhere each category first appears, under each named category weighting:");
  const sets = await listCategoryWeightSets(org.id);
  for (const set of sets) {
    const r = await rankOptions(org.id, { categoryWeightSetId: set.id });
    const fundable = r.rows.filter((x) => x.eligible);
    const firsts = categories
      .map((cat) => {
        const at = fundable.findIndex((x) => x.category === cat);
        return at < 0 ? `${cat} never` : `${cat} #${at + 1}`;
      })
      .join(", ");
    const mix = new Map<string, number>();
    for (const row of fundable.slice(0, 100)) mix.set(row.category, (mix.get(row.category) ?? 0) + 1);
    console.log(`  ${set.name.padEnd(14)} ${firsts}`);
    console.log(`  ${"".padEnd(14)} top 100 is ${[...mix].map(([k, v]) => `${v} ${k}`).join(", ")}`);
  }

  // What the budget caps do, which is the question ranking cannot answer.
  console.log("\nA 10-year run under each category funding plan — where the money actually goes:");
  // Curves must be the configured ones, the same set buildSimAssets used to
  // place each asset on its curve. Letting the evaluator fall back to the
  // built-in defaults while the assets carry the database's makes the run
  // internally inconsistent, and the numbers it prints unusable.
  const [simAssets, library, combos, curves] = await Promise.all([
    buildSimAssets(org.id),
    loadTreatmentDefs(org.id),
    loadCombinations(org.id),
    getMaterialCurves(org.id),
  ]);
  const assumptions = { ...DEFAULT_ASSUMPTIONS, analysisPeriodYears: 10 };

  const plans = await listFundingPlans(org.id);
  for (const set of [{ name: "No category order", plan: null }, ...plans.map((p) => ({ name: p.name, plan: p.steps }))]) {
    const run = runScenario(simAssets, assumptions, { library, combinations: combos, curves, fundingPlan: set.plan });
    const spentByCategory = new Map<string, number>();
    for (const year of run.years) {
      for (const project of year.selected) {
        spentByCategory.set(project.category, (spentByCategory.get(project.category) ?? 0) + project.cost);
      }
    }
    const total = [...spentByCategory.values()].reduce((a, b) => a + b, 0);
    const share = [...spentByCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${Math.round((v / (total || 1)) * 100)}%`)
      .join(", ");
    const cappedOut = run.years.reduce((a, y) => a + y.cappedOut, 0);

    console.log(
      // The budget grows each year, so the total is the sum of the years
      // rather than ten times the first one.
      `  ${set.name.padEnd(14)} spent ${money(run.totalSpend)} of ${money(
        run.years.reduce((a, y) => a + y.budget, 0)
      )} · ${share}`
    );
    console.log(
      `  ${"".padEnd(14)} final condition ${run.finalAvgCondition} · backlog ${money(run.finalBacklog)} · ${Math.round(run.totalFailures)} failures` +
        (cappedOut > 0 ? ` · ${money(cappedOut)} passed over because its category was full` : "")
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
