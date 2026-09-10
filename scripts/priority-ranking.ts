import { prisma } from "@/lib/prisma";
import { rankOptions } from "@/server/priority";
import { listCategoryWeightSets } from "@/server/category-weight-sets";

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
  for (const row of base.rows.slice(0, 10)) {
    console.log(
      `  ${String(row.priority).padStart(10)}  ${row.assetCode}  ${row.optionLabel.padEnd(24)}` +
        `${row.category.padEnd(13)} ${money(row.totalCost).padStart(11)}  benefit ${String(row.expectedBenefit).padStart(5)}` +
        `${row.isCombination ? "  [combination]" : ""}${row.isRecommended ? "  [recommended]" : ""}`
    );
  }

  console.log("\nPer category, across every option:");
  const categories = [...new Set(base.rows.map((r) => r.category))];
  for (const cat of categories) {
    const rows = base.rows.filter((r) => r.category === cat);
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
    const firsts = categories
      .map((cat) => {
        const at = r.rows.findIndex((x) => x.category === cat);
        return at < 0 ? `${cat} never` : `${cat} #${at + 1}`;
      })
      .join(", ");
    const mix = new Map<string, number>();
    for (const row of r.rows.slice(0, 100)) mix.set(row.category, (mix.get(row.category) ?? 0) + 1);
    console.log(`  ${set.name.padEnd(14)} ${firsts}`);
    console.log(`  ${"".padEnd(14)} top 100 is ${[...mix].map(([k, v]) => `${v} ${k}`).join(", ")}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
