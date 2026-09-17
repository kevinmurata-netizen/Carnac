import { prisma } from "@/lib/prisma";
import { generateWorkPlan, deleteWorkPlan } from "@/server/workplans";
import { resolveWeights } from "@/server/weight-sets";
import { resolveCategoryWeights } from "@/server/category-weight-sets";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { loadCombinations } from "@/server/combinations";
import { buildContexts } from "@/server/treatments";
import { buildSimAssets } from "@/server/scenarios";
import { enumerateOptions, type TreatmentCategory } from "@/domain/waterline/treatment";
import { evaluateCurve, effectiveAgeForCondition } from "@/domain/waterline/deterioration";
import { CATEGORY_KEYS } from "@/domain/waterline/category-weight";

/**
 * What work plan generation actually buys, measured against the real network.
 *
 *   npm run qa:workplan
 *
 * Generates a plan with fixed assumptions, prints what it bought, and deletes
 * it again. Written to compare one allocation rule against another on numbers
 * rather than on argument: run it, change the rule, run it again.
 *
 * The three lines that matter are the mix (what kinds of work the money went
 * to), the share of segments that got the cheapest thing available to them
 * (the failure mode of ranking each option by its own benefit ÷ cost), and the
 * replay — the network walked forward with the plan applied, which is the only
 * figure here that says whether the money did any good.
 */

const YEARS = 5;
const START_YEAR = new Date().getFullYear();
const GROWTH = 0.03;
const CONDITION_TARGET = 70;
const PLAN_NAME = "QA — Work Plan Allocation (temporary)";

const money = (n: number) => `$${(Math.round(n) / 1_000_000).toFixed(2)}M`;
const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 1000) / 10}%` : "—");

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error("No organization in this database");

  const budgetRow = await prisma.budget.findFirst({
    where: { organizationId: org.id },
    orderBy: { fiscalYear: "desc" },
  });
  const annualBudget = budgetRow?.amount ?? 4_000_000;

  const [weights, categories, library, combinations] = await Promise.all([
    resolveWeights(org.id, null),
    resolveCategoryWeights(org.id, null),
    loadTreatmentDefs(org.id),
    loadCombinations(org.id),
  ]);
  const categoryOf = new Map<string, TreatmentCategory>(library.map((d) => [d.name, d.category]));

  console.log(`${org.name} — ${YEARS} years from ${START_YEAR}, ${money(annualBudget)}/yr +${GROWTH * 100}%`);
  console.log(`weighting "${weights.name}", categories "${categories.name}"\n`);

  const result = await generateWorkPlan(org.id, {
    name: PLAN_NAME,
    startYear: START_YEAR,
    years: YEARS,
    annualBudget,
    fundingGrowth: GROWTH,
    weights: weights.weights,
    weightSetId: weights.weightSetId,
    categoryWeights: categories.weights,
    caps: categories.caps,
    categoryWeightSetId: categories.categoryWeightSetId,
  });

  try {
    await report(org.id, result, { annualBudget, library, combinations, categoryOf });
  } finally {
    await deleteWorkPlan(result.workPlanId);
  }
}

type Generated = Awaited<ReturnType<typeof generateWorkPlan>>;

async function report(
  organizationId: string,
  generated: Generated,
  ctx: {
    annualBudget: number;
    library: Awaited<ReturnType<typeof loadTreatmentDefs>>;
    combinations: Awaited<ReturnType<typeof loadCombinations>>;
    categoryOf: Map<string, TreatmentCategory>;
  }
) {
  const items = await prisma.workPlanItem.findMany({
    where: { workPlanId: generated.workPlanId },
    include: { treatment: { select: { name: true } } },
  });

  // A funded bundle is several rows sharing a bundleId — one decision, one set
  // of effects. Summing the rows would count its benefit once per member.
  type Project = {
    assetId: string;
    year: number;
    cost: number;
    category: TreatmentCategory;
    conditionImprovement: number;
    riskReduction: number;
    lifeCycleSavings: number;
    conditionAtScheduledYear: number;
  };
  const projects = new Map<string, Project>();
  for (const item of items) {
    const key = item.bundleId ?? item.id;
    const b = (item.expectedBenefit ?? {}) as Record<string, number>;
    const existing = projects.get(key);
    if (existing) {
      existing.cost += item.estimatedCost;
      continue;
    }
    projects.set(key, {
      assetId: item.assetId,
      year: item.year,
      cost: item.estimatedCost,
      category: ctx.categoryOf.get(item.treatment.name) ?? "Repair",
      conditionImprovement: b.conditionImprovement ?? 0,
      riskReduction: b.riskReduction ?? 0,
      lifeCycleSavings: b.lifeCycleSavings ?? 0,
      conditionAtScheduledYear: b.conditionAtScheduledYear ?? 0,
    });
  }
  const funded = [...projects.values()];
  const spend = funded.reduce((s, p) => s + p.cost, 0);

  console.log(`rows ${items.length}, projects ${funded.length}, segments ${new Set(funded.map((p) => p.assetId)).size}`);
  console.log(`spend ${money(spend)}, backlog ${generated.backlogCount} segments / ${money(generated.backlogCost)}\n`);

  console.log("by year");
  for (let i = 0; i < YEARS; i++) {
    const year = START_YEAR + i;
    const budget = ctx.annualBudget * Math.pow(1 + GROWTH, i);
    const inYear = funded.filter((p) => p.year === year);
    const spent = inYear.reduce((s, p) => s + p.cost, 0);
    console.log(
      `  ${year}  ${String(inYear.length).padStart(4)} projects  ${money(spent).padStart(7)} of ${money(budget)}  (${pct(spent, budget)})`
    );
  }

  console.log("\nby category");
  for (const category of CATEGORY_KEYS) {
    const inCategory = funded.filter((p) => p.category === category);
    if (inCategory.length === 0) continue;
    const spent = inCategory.reduce((s, p) => s + p.cost, 0);
    console.log(
      `  ${category.padEnd(13)} ${String(inCategory.length).padStart(4)} projects  ${money(spent).padStart(7)}  ${pct(spent, spend)} of spend`
    );
  }

  console.log("\nwhat was bought");
  console.log(`  condition points restored  ${Math.round(funded.reduce((s, p) => s + p.conditionImprovement, 0))}`);
  console.log(`  risk points removed        ${Math.round(funded.reduce((s, p) => s + p.riskReduction, 0))}`);
  console.log(`  life-cycle saving          ${money(funded.reduce((s, p) => s + p.lifeCycleSavings, 0))}`);

  // The cheapest-option share. Ranking each option by its own benefit ÷ cost
  // hands almost every segment its cheapest option; an incremental rule should
  // move this figure a long way.
  const contexts = await buildContexts(organizationId);
  const byAsset = new Map(contexts.map((c) => [c.asset.id, c]));
  let cheapest = 0;
  let comparable = 0;
  for (const p of funded) {
    const found = byAsset.get(p.assetId);
    if (!found) continue;
    const options = enumerateOptions(found.ctx, ctx.library, ctx.combinations).filter(
      (o) => o.category !== "Assess" && o.category !== "Retire"
    );
    if (options.length < 2) continue;
    comparable++;
    const min = Math.min(...options.map((o) => o.cost));
    if (p.cost <= min + 1) cheapest++;
  }
  console.log(
    `\n  cheapest option on the segment  ${cheapest} of ${comparable} segments with a choice (${pct(cheapest, comparable)})`
  );

  // Replay: walk the network forward with the plan applied, so the plan is
  // judged on what it leaves behind rather than on what it spent.
  const simAssets = await buildSimAssets(organizationId);
  const state = new Map(simAssets.map((a) => [a.id, { condition: a.condition, age: a.effectiveAge, curve: a.curve }]));
  const startAvg = [...state.values()].reduce((s, a) => s + a.condition, 0) / (state.size || 1);
  for (let i = 0; i < YEARS; i++) {
    const year = START_YEAR + i;
    for (const p of funded.filter((x) => x.year === year)) {
      const asset = state.get(p.assetId);
      if (!asset) continue;
      asset.condition = Math.min(100, p.conditionAtScheduledYear + p.conditionImprovement);
      asset.age = effectiveAgeForCondition(asset.curve, asset.condition);
    }
    for (const asset of state.values()) {
      asset.age += 1;
      asset.condition = evaluateCurve(asset.curve, asset.age);
    }
  }
  const endAvg = [...state.values()].reduce((s, a) => s + a.condition, 0) / (state.size || 1);
  const below = [...state.values()].filter((a) => a.condition < CONDITION_TARGET).length;
  console.log(`\nreplay  WCI ${Math.round(startAvg * 10) / 10} → ${Math.round(endAvg * 10) / 10}`);
  console.log(`        ${below} of ${state.size} segments below ${CONDITION_TARGET} at ${START_YEAR + YEARS - 1}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
