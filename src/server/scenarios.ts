import { prisma } from "@/lib/prisma";
import { WorkPlanItemStatus } from "@prisma/client";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import {
  runScenario,
  curveFor,
  DEFAULT_ASSUMPTIONS,
  STRATEGIES,
  type ScenarioAssumptions,
  type SimAsset,
  type Strategy,
  type ScenarioRunResult,
} from "@/domain/waterline/scenario";
import { effectiveAgeForCondition } from "@/domain/waterline/deterioration";
import { ageInYears } from "@/lib/format";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { getMaterialCurves } from "@/server/settings";

/** Snapshot the current network into simulation inputs. Condition comes from
 * the latest measurement; uninspected assets fall back to their curve position
 * by calendar age so they still participate in the forecast. */
export async function buildSimAssets(organizationId: string): Promise<SimAsset[]> {
  const assets = await prisma.asset.findMany({
    where: { organizationId, assetType: { code: "WATERLINE" }, deletedAt: null, status: "ACTIVE" },
    include: {
      attributeValues: { include: { definition: true } },
      conditionMeasurements: { orderBy: { measurementDate: "desc" }, take: 1 },
      riskAssessments: { orderBy: { assessmentDate: "desc" }, take: 1 },
    },
  });

  // Curves come from the configured deterioration models, so editing one in
  // Settings changes every forecast this simulation produces.
  const curves = await getMaterialCurves(organizationId);

  return assets.map((asset) => {
    const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);
    const material = attr(WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null;
    const curve = curveFor(material, curves);

    const measured = asset.conditionMeasurements[0]?.score ?? null;
    const age = ageInYears(asset.installationDate) ?? 0;
    const condition = measured ?? Math.max(0, 100 - (age / curve.serviceLife) * 100);

    return {
      id: asset.id,
      assetCode: asset.assetCode,
      material,
      diameterInches: attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null,
      lengthFt: attr(WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? null,
      customersServed: attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null,
      cof: asset.riskAssessments[0]?.consequenceScore ?? 3,
      condition,
      effectiveAge: effectiveAgeForCondition(curve, condition),
      curve,
    };
  });
}

function assumptionsFromRows(rows: Array<{ key: string; value: unknown }>): ScenarioAssumptions {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const strategy = String(map.strategy ?? DEFAULT_ASSUMPTIONS.strategy) as Strategy;
  return {
    annualBudget: Number(map.annualBudget ?? DEFAULT_ASSUMPTIONS.annualBudget),
    fundingGrowth: Number(map.fundingGrowth ?? DEFAULT_ASSUMPTIONS.fundingGrowth),
    discountRate: Number(map.discountRate ?? DEFAULT_ASSUMPTIONS.discountRate),
    analysisPeriodYears: Number(map.analysisPeriodYears ?? DEFAULT_ASSUMPTIONS.analysisPeriodYears),
    conditionTarget: Number(map.conditionTarget ?? DEFAULT_ASSUMPTIONS.conditionTarget),
    riskThreshold: Number(map.riskThreshold ?? DEFAULT_ASSUMPTIONS.riskThreshold),
    strategy: STRATEGIES.includes(strategy) ? strategy : DEFAULT_ASSUMPTIONS.strategy,
  };
}

export async function createScenario(
  organizationId: string,
  input: { name: string; description?: string; assumptions: ScenarioAssumptions }
) {
  return prisma.scenario.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description || null,
      assumptions: {
        create: Object.entries(input.assumptions).map(([key, value]) => ({ key, value })),
      },
    },
  });
}

/**
 * Change a scenario's name, description and assumptions. Assumption rows are
 * replaced wholesale rather than upserted per key — there is no unique
 * constraint on (scenarioId, key), so an upsert could silently leave a stale
 * duplicate that assumptionsFromRows would then read at random.
 */
export async function updateScenario(
  organizationId: string,
  scenarioId: string,
  input: { name: string; description?: string; assumptions: ScenarioAssumptions }
) {
  const scenario = await prisma.scenario.findFirst({ where: { id: scenarioId, organizationId } });
  if (!scenario) throw new Error("Scenario not found");
  if (!input.name.trim()) throw new Error("Scenario name is required");

  await prisma.$transaction([
    prisma.scenario.update({
      where: { id: scenarioId },
      data: { name: input.name.trim(), description: input.description?.trim() || null },
    }),
    prisma.scenarioAssumption.deleteMany({ where: { scenarioId } }),
    prisma.scenarioAssumption.createMany({
      data: Object.entries(input.assumptions).map(([key, value]) => ({ scenarioId, key, value })),
    }),
  ]);
}

/** Run the simulation and replace this scenario's stored results. */
export async function runAndStoreScenario(organizationId: string, scenarioId: string): Promise<ScenarioRunResult> {
  const scenario = await prisma.scenario.findFirst({
    where: { id: scenarioId, organizationId },
    include: { assumptions: true },
  });
  if (!scenario) throw new Error("Scenario not found");

  const assumptions = assumptionsFromRows(scenario.assumptions);
  const simAssets = await buildSimAssets(organizationId);
  // Run against the configured library so edited treatments and decision
  // trees change what a scenario is allowed to fund.
  const result = runScenario(simAssets, assumptions, await loadTreatmentDefs(organizationId));

  await prisma.scenarioResult.deleteMany({ where: { scenarioId } });
  await prisma.scenarioResult.createMany({
    data: result.years.flatMap((y) => [
      { scenarioId, year: y.year, metricKey: "budget", metricValue: y.budget },
      { scenarioId, year: y.year, metricKey: "spend", metricValue: y.spend },
      { scenarioId, year: y.year, metricKey: "treatedCount", metricValue: y.treatedCount },
      { scenarioId, year: y.year, metricKey: "avgCondition", metricValue: y.avgCondition },
      { scenarioId, year: y.year, metricKey: "avgRisk", metricValue: y.avgRisk },
      { scenarioId, year: y.year, metricKey: "backlog", metricValue: y.backlog },
      { scenarioId, year: y.year, metricKey: "expectedFailures", metricValue: y.expectedFailures },
      { scenarioId, year: y.year, metricKey: "failureCost", metricValue: y.failureCost },
      { scenarioId, year: y.year, metricKey: "belowTargetCount", metricValue: y.belowTargetCount },
    ]),
  });
  await persistScenarioProgramme(scenarioId, scenario.name, result);
  await prisma.scenario.update({ where: { id: scenarioId }, data: { updatedAt: new Date() } });

  return result;
}

/**
 * Materialize the projects a run actually funded as a WorkPlan linked to the
 * scenario. The schema already carries WorkPlan.scenarioId for exactly this;
 * a scenario run *is* a programme of work, so storing it as one means the
 * project list is queryable and shows up wherever work plans do, rather than
 * being summarized away into yearly totals.
 */
async function persistScenarioProgramme(
  scenarioId: string,
  scenarioName: string,
  result: ScenarioRunResult
) {
  const existing = await prisma.workPlan.findMany({ where: { scenarioId }, select: { id: true } });
  if (existing.length > 0) {
    const ids = existing.map((w) => w.id);
    await prisma.workPlanItem.deleteMany({ where: { workPlanId: { in: ids } } });
    await prisma.workPlan.deleteMany({ where: { id: { in: ids } } });
  }

  const years = result.years.filter((y) => y.selected.length > 0);
  if (years.length === 0) return;

  const treatments = await prisma.treatment.findMany({ select: { id: true, name: true } });
  const treatmentIdByName = new Map(treatments.map((t) => [t.name, t.id]));

  const workPlan = await prisma.workPlan.create({
    data: {
      scenarioId,
      name: `${scenarioName} — Funded Programme`,
      startYear: years[0].year,
      endYear: years[years.length - 1].year,
    },
  });

  const items = years.flatMap((year) =>
    year.selected.flatMap((p) => {
      const treatmentId = treatmentIdByName.get(p.treatment);
      if (!treatmentId) return [];
      return [{
        workPlanId: workPlan.id,
        assetId: p.assetId,
        treatmentId,
        year: year.year,
        estimatedCost: p.cost,
        expectedBenefit: {
          conditionBefore: p.conditionBefore,
          conditionAfter: p.conditionAfter,
          riskBefore: p.riskBefore,
          riskAfter: p.riskAfter,
          riskReductionPct:
            p.riskBefore > 0 ? Math.round(((p.riskBefore - p.riskAfter) / p.riskBefore) * 1000) / 10 : 0,
        },
        reasonExplanation:
          `Selected by the ${scenarioName} run in ${year.year}. ` +
          `Condition ${p.conditionBefore} → ${p.conditionAfter}, risk ${p.riskBefore} → ${p.riskAfter}.`,
        fundingSource: "Scenario Budget",
        status: WorkPlanItemStatus.PLANNED,
      }];
    })
  );

  if (items.length > 0) await prisma.workPlanItem.createMany({ data: items });
}

export type ScenarioProjectRow = {
  year: number;
  assetId: string;
  assetCode: string;
  serviceArea: string | null;
  treatment: string;
  cost: number;
  conditionBefore: number | null;
  conditionAfter: number | null;
  riskBefore: number | null;
  riskAfter: number | null;
  riskReductionPct: number | null;
};

/** The projects a scenario run funded, newest run only. */
export async function getScenarioProjects(
  organizationId: string,
  scenarioId: string
): Promise<ScenarioProjectRow[]> {
  const items = await prisma.workPlanItem.findMany({
    where: { workPlan: { scenarioId }, asset: { organizationId, deletedAt: null } },
    include: {
      asset: { select: { id: true, assetCode: true, location: { select: { serviceArea: true } } } },
      treatment: { select: { name: true } },
    },
    orderBy: [{ year: "asc" }, { estimatedCost: "desc" }],
  });

  return items.map((i) => {
    const b = (i.expectedBenefit ?? {}) as {
      conditionBefore?: number;
      conditionAfter?: number;
      riskBefore?: number;
      riskAfter?: number;
      riskReductionPct?: number;
    };
    return {
      year: i.year,
      assetId: i.asset.id,
      assetCode: i.asset.assetCode,
      serviceArea: i.asset.location?.serviceArea ?? null,
      treatment: i.treatment.name,
      cost: Math.round(i.estimatedCost),
      conditionBefore: b.conditionBefore ?? null,
      conditionAfter: b.conditionAfter ?? null,
      riskBefore: b.riskBefore ?? null,
      riskAfter: b.riskAfter ?? null,
      riskReductionPct: b.riskReductionPct ?? null,
    };
  });
}

export type ScenarioSummary = {
  id: string;
  name: string;
  description: string | null;
  assumptions: ScenarioAssumptions;
  hasResults: boolean;
  finalAvgCondition: number | null;
  finalBacklog: number | null;
  totalSpend: number | null;
  totalFailures: number | null;
  /** Average network condition per year, so scenarios can be plotted against
   * each other without loading each one's full result set. */
  conditionSeries: Array<{ year: number; avgCondition: number }>;
  updatedAt: Date;
};

export async function listScenarios(organizationId: string): Promise<ScenarioSummary[]> {
  const scenarios = await prisma.scenario.findMany({
    where: { organizationId },
    include: { assumptions: true, results: true },
    orderBy: { createdAt: "asc" },
  });

  return scenarios.map((s) => {
    const assumptions = assumptionsFromRows(s.assumptions);
    const byMetric = (key: string) => s.results.filter((r) => r.metricKey === key).sort((a, b) => a.year - b.year);
    const conditions = byMetric("avgCondition");
    const backlogs = byMetric("backlog");
    const spends = byMetric("spend");
    const failures = byMetric("expectedFailures");

    return {
      id: s.id,
      name: s.name,
      description: s.description,
      assumptions,
      hasResults: s.results.length > 0,
      finalAvgCondition: conditions.at(-1)?.metricValue ?? null,
      finalBacklog: backlogs.at(-1)?.metricValue ?? null,
      totalSpend: spends.length ? Math.round(spends.reduce((sum, r) => sum + r.metricValue, 0)) : null,
      totalFailures: failures.length ? Math.round(failures.reduce((sum, r) => sum + r.metricValue, 0)) : null,
      conditionSeries: conditions.map((r) => ({ year: r.year, avgCondition: r.metricValue })),
      updatedAt: s.updatedAt,
    };
  });
}

export type ScenarioDetail = ScenarioSummary & {
  years: Array<{
    year: number;
    budget: number;
    spend: number;
    treatedCount: number;
    avgCondition: number;
    avgRisk: number;
    backlog: number;
    expectedFailures: number;
    failureCost: number;
    belowTargetCount: number;
  }>;
};

export async function getScenario(organizationId: string, scenarioId: string): Promise<ScenarioDetail | null> {
  const s = await prisma.scenario.findFirst({
    where: { id: scenarioId, organizationId },
    include: { assumptions: true, results: true },
  });
  if (!s) return null;

  const yearMap = new Map<number, Record<string, number>>();
  for (const r of s.results) {
    const entry = yearMap.get(r.year) ?? {};
    entry[r.metricKey] = r.metricValue;
    yearMap.set(r.year, entry);
  }

  const summaries = await listScenarios(organizationId);
  const summary = summaries.find((x) => x.id === scenarioId)!;

  return {
    ...summary,
    years: [...yearMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([year, m]) => ({
        year,
        budget: m.budget ?? 0,
        spend: m.spend ?? 0,
        treatedCount: m.treatedCount ?? 0,
        avgCondition: m.avgCondition ?? 0,
        avgRisk: m.avgRisk ?? 0,
        backlog: m.backlog ?? 0,
        expectedFailures: m.expectedFailures ?? 0,
        failureCost: m.failureCost ?? 0,
        belowTargetCount: m.belowTargetCount ?? 0,
      })),
  };
}

export async function deleteScenario(organizationId: string, scenarioId: string) {
  const scenario = await prisma.scenario.findFirst({ where: { id: scenarioId, organizationId } });
  if (!scenario) throw new Error("Scenario not found");

  // The funded programme a run materializes holds a scenarioId FK, so it has to
  // go before the scenario itself does.
  const plans = await prisma.workPlan.findMany({ where: { scenarioId }, select: { id: true } });
  const planIds = plans.map((p) => p.id);

  await prisma.$transaction([
    prisma.workPlanItem.deleteMany({ where: { workPlanId: { in: planIds } } }),
    prisma.workPlan.deleteMany({ where: { id: { in: planIds } } }),
    prisma.scenarioResult.deleteMany({ where: { scenarioId } }),
    prisma.scenarioAssumption.deleteMany({ where: { scenarioId } }),
    prisma.scenario.delete({ where: { id: scenarioId } }),
  ]);
}

/** The utility's current annual capital budget, used for dashboard KPIs and
 * as the default when creating a scenario. */
export async function getAnnualBudget(organizationId: string): Promise<number | null> {
  const budget = await prisma.budget.findFirst({
    where: { organizationId },
    orderBy: { fiscalYear: "desc" },
  });
  return budget?.amount ?? null;
}

const BASELINE_SCENARIOS: Array<{ name: string; description: string; overrides: Partial<ScenarioAssumptions> }> = [
  {
    name: "Current Funding",
    description: "Today's capital budget held flat in real terms, prioritized by risk.",
    overrides: { strategy: "risk-based" },
  },
  {
    name: "Increased Funding (+50%)",
    description: "Half again the current budget, prioritized by risk.",
    overrides: { annualBudget: 6_000_000, strategy: "risk-based" },
  },
  {
    name: "Reduced Funding (-40%)",
    description: "Budget cut to test how quickly condition and backlog deteriorate.",
    overrides: { annualBudget: 2_400_000, strategy: "risk-based" },
  },
  {
    name: "Worst-First (Condition)",
    description: "Same budget as Current Funding, but prioritized purely by condition.",
    overrides: { strategy: "condition-based" },
  },
];

/** Idempotently seed a capital budget and the baseline comparison scenarios. */
export async function ensureBaselineScenarios(organizationId: string): Promise<number> {
  const existingBudget = await prisma.budget.findFirst({ where: { organizationId } });
  if (!existingBudget) {
    await prisma.budget.create({
      data: {
        organizationId,
        name: "Annual Capital Budget",
        fiscalYear: new Date().getFullYear(),
        amount: DEFAULT_ASSUMPTIONS.annualBudget,
      },
    });
  }

  let created = 0;
  for (const spec of BASELINE_SCENARIOS) {
    const existing = await prisma.scenario.findFirst({ where: { organizationId, name: spec.name } });
    if (existing) continue;
    const scenario = await createScenario(organizationId, {
      name: spec.name,
      description: spec.description,
      assumptions: { ...DEFAULT_ASSUMPTIONS, ...spec.overrides },
    });
    await runAndStoreScenario(organizationId, scenario.id);
    created++;
  }
  return created;
}
