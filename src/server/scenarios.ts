import { prisma } from "@/lib/prisma";
import { Prisma, WorkPlanItemStatus } from "@prisma/client";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import {
  runScenario,
  curveFor,
  DEFAULT_ASSUMPTIONS,
  STRATEGIES,
  FUNDING_MODES,
  AFTER_TARGET,
  solveForTarget,
  goalOf,
  type AfterTarget,
  type FundingMode,
  type ScenarioAssumptions,
  type SimAsset,
  type Strategy,
  type ScenarioRunResult,
  type ScenarioRunOptions,
} from "@/domain/waterline/scenario";
import { runDeliveryScenario, type DeliveryRunResult } from "@/domain/waterline/delivery-scenario";
import {
  PROGRAMMED_FUNDING,
  type LockedProject,
  type ProgrammedFunding,
} from "@/domain/waterline/locked-projects";
import { isImmediate, type LeadTimes } from "@/domain/waterline/lead-time";
import { resolveLeadTimes } from "@/server/lead-times";
import { effectiveAgeForCondition } from "@/domain/waterline/deterioration";
import { ageInYears } from "@/lib/format";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { resolveCategoryWeights } from "@/server/category-weight-sets";
import { resolveFundingPlan } from "@/server/category-funding";
import { resolveWeights } from "@/server/weight-sets";
import { resolveOptionSelection } from "@/server/scenario-options";
import { loadCombinations } from "@/server/combinations";
import { getMaterialCurves } from "@/server/settings";
import { assetScaleFactors } from "@/server/scale-factors";
import { NEUTRAL_SCALE_FACTOR } from "@/domain/waterline/scale-factor";
import { computeCriticalityScore } from "@/domain/waterline/risk";
import { criticalityRescorer } from "@/server/criticality";
import { matchingAssetIds } from "@/server/saved-filters";
import { resultsOutOfWindow, type ScenarioSetStatusValue, type ScenarioWindow } from "@/lib/scenario-sets";
import { assertSetInOrganization } from "@/server/scenario-sets";
import { MODELLED, modelledType } from "@/server/modelled-asset-type";
import { treatmentIdsForAssets } from "@/server/treatment-lookup";

/** Snapshot the current network into simulation inputs. Condition comes from
 * the latest measurement; uninspected assets fall back to their curve position
 * by calendar age so they still participate in the forecast. */
/**
 * The network a run works over.
 *
 * `only` narrows it to the assets a scenario's saved filter matched. An empty
 * array is not the same as no array: it means the filter matched nothing, and
 * is the caller's to refuse rather than this function's to widen back to
 * everything.
 */
export async function buildSimAssets(organizationId: string, only?: string[]): Promise<SimAsset[]> {
  const assets = await prisma.asset.findMany({
    where: {
      organizationId,
      assetType: MODELLED,
      deletedAt: null,
      status: "ACTIVE",
      ...(only ? { id: { in: only } } : {}),
    },
    include: {
      attributeValues: { include: { definition: true } },
      conditionMeasurements: { where: { assetComponentId: null }, orderBy: { measurementDate: "desc" }, take: 1 },
      riskAssessments: { where: { assetComponentId: null }, orderBy: { assessmentDate: "desc" }, take: 1 },
      criticalityScores: { orderBy: { calculatedAt: "desc" }, take: 1, select: { score: true } },
      location: { select: { serviceArea: true, pressureZone: true } },
    },
  });

  // Curves come from the configured deterioration models, so editing one in
  // Settings changes every forecast this simulation produces.
  //
  // Scale factors are read once, here, rather than each year inside the run:
  // the formula is over length, diameter and the like, none of which a
  // treatment changes.
  const assetType = await prisma.assetType.findFirst({
    where: modelledType(organizationId),
    select: { id: true },
  });
  const [curves, scale] = await Promise.all([
    getMaterialCurves(organizationId),
    assetType
      ? assetScaleFactors(organizationId, assetType.id)
      : Promise.resolve({ factors: new Map<string, { factor: number; missing: boolean }>(), name: null }),
  ]);

  return assets.map((asset) => {
    const attr = (code: string) => asset.attributeValues.find((v) => v.definition.code === code);
    const material = attr(WATERLINE_ATTRIBUTES.MATERIAL)?.textValue ?? null;
    const curve = curveFor(material, curves);

    const measured = asset.conditionMeasurements[0]?.score ?? null;
    const age = ageInYears(asset.installationDate) ?? 0;
    const condition = measured ?? Math.max(0, 100 - (age / curve.serviceLife) * 100);

    return {
      id: asset.id,
      assetTypeId: asset.assetTypeId,
      assetCode: asset.assetCode,
      material,
      diameterInches: attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null,
      lengthFt: attr(WATERLINE_ATTRIBUTES.LENGTH)?.numberValue ?? null,
      customersServed: attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null,
      cof: asset.riskAssessments[0]?.consequenceScore ?? 3,
      condition,
      effectiveAge: effectiveAgeForCondition(curve, condition),
      ageYears: age,
      curve,
      criticality: attr(WATERLINE_ATTRIBUTES.CRITICALITY)?.textValue ?? null,
      customerType: attr(WATERLINE_ATTRIBUTES.CUSTOMER_TYPE)?.textValue ?? null,
      // The stored score where the model has run, otherwise the risk-based
      // default — the same fallback the network-wide ranking uses, so a
      // scenario and Treatment Planning agree about what an asset is worth.
      criticalityScore:
        asset.criticalityScores[0]?.score ??
        computeCriticalityScore({
          customersServed: attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED)?.numberValue ?? null,
          criticality: attr(WATERLINE_ATTRIBUTES.CRITICALITY)?.textValue ?? null,
          diameterInches: attr(WATERLINE_ATTRIBUTES.DIAMETER)?.numberValue ?? null,
          customerType: attr(WATERLINE_ATTRIBUTES.CUSTOMER_TYPE)?.textValue ?? null,
        }).score,
      scaleFactor: scale.factors.get(asset.id)?.factor ?? NEUTRAL_SCALE_FACTOR,
      serviceArea: asset.location?.serviceArea ?? null,
      pressureZone: asset.location?.pressureZone ?? null,
    };
  });
}

export function assumptionsFromRows(rows: Array<{ key: string; value: unknown }>): ScenarioAssumptions {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const strategy = String(map.strategy ?? DEFAULT_ASSUMPTIONS.strategy) as Strategy;
  // Absent on every scenario stored before target mode existed, which is
  // exactly what the default says: constrained by its budget.
  const fundingMode = FUNDING_MODES.includes(String(map.fundingMode) as FundingMode)
    ? (String(map.fundingMode) as FundingMode)
    : DEFAULT_ASSUMPTIONS.fundingMode;

  // One target now. A target run stored while there were two kept its goal
  // in `targetValue`, and that is the number the person was aiming at, so it
  // wins over the old Condition Target beside it. A stored null is a budget
  // run with no target line; a missing row is a scenario from before either
  // existed, which had the default.
  const legacyGoal = fundingMode === "target" && map.targetValue != null ? Number(map.targetValue) : null;
  const conditionTarget =
    legacyGoal ??
    (map.conditionTarget === null && fundingMode === "budget"
      ? null
      : Number(map.conditionTarget ?? DEFAULT_ASSUMPTIONS.conditionTarget));

  return {
    annualBudget: Number(map.annualBudget ?? DEFAULT_ASSUMPTIONS.annualBudget),
    fundingGrowth: Number(map.fundingGrowth ?? DEFAULT_ASSUMPTIONS.fundingGrowth),
    discountRate: Number(map.discountRate ?? DEFAULT_ASSUMPTIONS.discountRate),
    analysisPeriodYears: Number(map.analysisPeriodYears ?? DEFAULT_ASSUMPTIONS.analysisPeriodYears),
    conditionTarget,
    riskThreshold: Number(map.riskThreshold ?? DEFAULT_ASSUMPTIONS.riskThreshold),
    strategy: STRATEGIES.includes(strategy) ? strategy : DEFAULT_ASSUMPTIONS.strategy,
    fundingMode,
    targetMetric: DEFAULT_ASSUMPTIONS.targetMetric,
    targetInYears: Number(map.targetInYears ?? DEFAULT_ASSUMPTIONS.targetInYears),
    // Absent on every scenario stored before the choice existed, all of which
    // held the target.
    afterTarget: AFTER_TARGET.includes(map.afterTarget as AfterTarget)
      ? (map.afterTarget as AfterTarget)
      : DEFAULT_ASSUMPTIONS.afterTarget,
    // Absent on every scenario stored before locked projects existed, none of
    // which locks anything; the default only matters once one does.
    programmedFunding: PROGRAMMED_FUNDING.includes(map.programmedFunding as ProgrammedFunding)
      ? (map.programmedFunding as ProgrammedFunding)
      : DEFAULT_ASSUMPTIONS.programmedFunding,
  };
}

/**
 * Assumptions as rows to store.
 *
 * A null value is written as JSON null rather than left out: "no target" is a
 * choice, and a missing row reads as the default target instead.
 */
export function assumptionRows(assumptions: ScenarioAssumptions) {
  return Object.entries(assumptions).map(([key, value]) => ({
    key,
    value: value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue),
  }));
}

/**
 * The assumptions a scenario actually runs with.
 *
 * Inside a set, the set's planning period replaces the scenario's own. The
 * scenario's value stays stored rather than being overwritten, so leaving the
 * set gives back what it had.
 */
export function effectiveAssumptions(
  rows: Array<{ key: string; value: unknown }>,
  set: ScenarioWindow | null
): ScenarioAssumptions {
  const own = assumptionsFromRows(rows);
  return set ? { ...own, analysisPeriodYears: set.planningPeriodYears } : own;
}

/**
 * A plan a scenario may lock: one that exists, and not a scenario run's own
 * programme — that is rewritten every time its scenario runs, so locking it
 * would have a scenario run against whatever it last produced, and its own
 * re-run would be refused by the very lock.
 */
async function assertLockablePlan(planId: string | null) {
  if (!planId) return;
  const plan = await prisma.workPlan.findUnique({ where: { id: planId }, select: { isScenarioMirror: true, name: true } });
  if (!plan) throw new Error("That work plan no longer exists");
  if (plan.isScenarioMirror) {
    throw new Error(
      `“${plan.name}” is a scenario run's own programme and changes every time that scenario runs. Make an editable plan from it, and lock that.`
    );
  }
}

/** Ids arrive from forms; a filter from another organization must not be
 * attachable, or a scenario could be pointed at someone else's assets. */
async function assertFilterInOrganization(organizationId: string, filterId: string | null) {
  if (!filterId) return;
  const filter = await prisma.savedFilter.findFirst({
    where: { id: filterId, organizationId },
    select: { id: true },
  });
  if (!filter) throw new Error("Saved filter not found");
}

export async function createScenario(
  organizationId: string,
  input: {
    name: string;
    description?: string;
    assumptions: ScenarioAssumptions;
    /** Which criticality formula ranks work plans generated from this
     * scenario. Null follows the asset type's active formula. */
    criticalityModelId?: string | null;
    /** Which named weighting ranks this scenario's work plans. Null uses the
     * organization's default set. */
    weightSetId?: string | null;
    /** Which named category weighting this scenario leans by. Null uses the
     * organization's default set. */
    categoryWeightSetId?: string | null;
    /** The most of its budget each category may take. Null
     * means no category limits at all. */
    categoryFundingPlanId?: string | null;
    /** How long its work takes to be paid for and built. Null uses the
     * organization's default set, and no default means everything happens in
     * the year it is decided. */
    leadTimeSetId?: string | null;
    /** Which assets it runs over. Null is the whole network. */
    savedFilterId?: string | null;
    /** The set it belongs to. Null leaves it on its own. */
    scenarioSetId?: string | null;
    /** A work plan whose projects it runs with as they are. Null locks none. */
    lockedWorkPlanId?: string | null;
  }
) {
  await assertSetInOrganization(organizationId, input.scenarioSetId ?? null);
  await assertFilterInOrganization(organizationId, input.savedFilterId ?? null);
  await assertLockablePlan(input.lockedWorkPlanId ?? null);
  return prisma.scenario.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description || null,
      criticalityModelId: input.criticalityModelId || null,
      weightSetId: input.weightSetId || null,
      categoryWeightSetId: input.categoryWeightSetId || null,
      categoryFundingPlanId: input.categoryFundingPlanId || null,
      leadTimeSetId: input.leadTimeSetId || null,
      savedFilterId: input.savedFilterId || null,
      scenarioSetId: input.scenarioSetId || null,
      lockedWorkPlanId: input.lockedWorkPlanId || null,
      assumptions: {
        create: assumptionRows(input.assumptions),
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
  input: {
    name: string;
    description?: string;
    assumptions: ScenarioAssumptions;
    criticalityModelId?: string | null;
    /** Which named weighting ranks this scenario's work plans. Null uses the
     * organization's default set. */
    weightSetId?: string | null;
    /** Which named category weighting this scenario leans by. Null uses the
     * organization's default set. */
    categoryWeightSetId?: string | null;
    /** The most of its budget each category may take. Null
     * means no category limits at all. */
    categoryFundingPlanId?: string | null;
    /** How long its work takes to be paid for and built. Null uses the
     * organization's default set. */
    leadTimeSetId?: string | null;
    /** Which assets it runs over. Null is the whole network. */
    savedFilterId?: string | null;
    /** The set it belongs to. Null takes it out of any set. */
    scenarioSetId?: string | null;
    /** A work plan whose projects it runs with as they are. Null locks none. */
    lockedWorkPlanId?: string | null;
  }
) {
  const scenario = await prisma.scenario.findFirst({ where: { id: scenarioId, organizationId } });
  if (!scenario) throw new Error("Scenario not found");
  if (!input.name.trim()) throw new Error("Scenario name is required");
  await assertFilterInOrganization(organizationId, input.savedFilterId ?? null);
  // A scenario already in a set can move to another but not leave. Older
  // scenarios created before sets existed may still be saved outside one.
  if (scenario.scenarioSetId && !input.scenarioSetId) {
    throw new Error("A scenario in a set can be moved to another set, but not taken out of one");
  }
  await assertSetInOrganization(organizationId, input.scenarioSetId ?? null);
  await assertLockablePlan(input.lockedWorkPlanId ?? null);

  await prisma.$transaction([
    prisma.scenario.update({
      where: { id: scenarioId },
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        criticalityModelId: input.criticalityModelId || null,
        weightSetId: input.weightSetId || null,
        categoryWeightSetId: input.categoryWeightSetId || null,
        categoryFundingPlanId: input.categoryFundingPlanId || null,
        leadTimeSetId: input.leadTimeSetId || null,
        savedFilterId: input.savedFilterId || null,
        scenarioSetId: input.scenarioSetId || null,
        lockedWorkPlanId: input.lockedWorkPlanId || null,
      },
    }),
    prisma.scenarioAssumption.deleteMany({ where: { scenarioId } }),
    prisma.scenarioAssumption.createMany({
      data: assumptionRows(input.assumptions).map((row) => ({ scenarioId, ...row })),
    }),
  ]);
}

/**
 * Everything a run of this scenario needs, gathered once.
 *
 * The one place a scenario's settings become simulation inputs. Anything that
 * re-runs a scenario — storing its results, or Model Results recovering each
 * asset's path — goes through here, so the two cannot describe different runs.
 * They used to: Model Results passed only the treatment library, and silently
 * ignored the scenario's combinations, weightings, funding plan, option
 * selection and curves.
 */
export async function loadScenarioRun(
  organizationId: string,
  scenarioId: string
): Promise<{
  name: string;
  assumptions: ScenarioAssumptions;
  simAssets: SimAsset[];
  options: ScenarioRunOptions;
  /** How long this scenario's work takes to be paid for and built. Everything
   * immediate — the default — is the engine this app has always had. */
  leadTimes: LeadTimes;
  /** The saved filter deciding which assets this run covers, where it has
   * one. Carried so a caller can say what the run is about. */
  filter: { id: string; name: string; assetCount: number } | null;
  /** The work plan whose projects this run locks, where it locks one, and
   * how many of its projects fell outside the run's assets. */
  locked: { planId: string; planName: string; count: number; outsideRun: number } | null;
} | null> {
  const scenario = await prisma.scenario.findFirst({
    where: { id: scenarioId, organizationId },
    include: {
      assumptions: true,
      scenarioSet: { select: { baseYear: true, planningPeriodYears: true } },
      savedFilter: { select: { id: true, name: true } },
      lockedWorkPlan: { select: { id: true, name: true } },
    },
  });
  if (!scenario) return null;

  // Which assets this scenario is about. A filter with no criteria matches
  // everything, and `matchingAssetIds` says so by returning null — the same
  // answer as having no filter at all, so the run covers the whole network.
  const only = scenario.savedFilter
    ? ((await matchingAssetIds(organizationId, scenario.savedFilter.id)) ?? undefined)
    : undefined;
  if (scenario.savedFilter && only && only.length === 0) {
    throw new Error(
      `${scenario.savedFilter.name} matches no assets, so this scenario has nothing to run over. Widen the filter, or take it off the scenario.`
    );
  }

  // A set decides the years: its base year starts the run and its planning
  // period replaces the scenario's own, so every member covers the same span.
  const assumptions = effectiveAssumptions(scenario.assumptions, scenario.scenarioSet);
  const waterlineType = await prisma.assetType.findFirst({
    where: modelledType(organizationId),
    select: { id: true },
  });
  const [simAssets, library, combinations, weights, categories, funding, selection, curves, criticality, leadTimes] =
    await Promise.all([
    buildSimAssets(organizationId, only),
    // Run against the configured library so edited treatments and decision
    // trees change what a scenario is allowed to fund.
    loadTreatmentDefs(organizationId),
    loadCombinations(organizationId),
    // What makes one treatment better than another on the merits.
    resolveWeights(organizationId, scenario.weightSetId),
    // How far this scenario leans toward each kind of work, as a multiplier
    // on the Priority Score.
    resolveCategoryWeights(organizationId, scenario.categoryWeightSetId),
    // The most of its budget each category may take. Null means no category limits, only the year's budget.
    resolveFundingPlan(organizationId, scenario.categoryFundingPlanId),
    // And what it is allowed to consider at all. Null means the whole library.
    resolveOptionSelection(organizationId, scenarioId),
    getMaterialCurves(organizationId),
    // How criticality is rescored as the run changes the network — the
    // scenario's own formula where it names one, otherwise the active one.
    waterlineType
      ? criticalityRescorer(organizationId, waterlineType.id, scenario.criticalityModelId)
      : Promise.resolve(null),
    // How long its work takes to be paid for and built. No set, or a set that
    // leaves everything immediate, is the engine this app has always had.
    resolveLeadTimes(organizationId, scenario.leadTimeSetId),
  ]);

  const locked = scenario.lockedWorkPlan
    ? await lockedProjects(scenario.lockedWorkPlan.id, new Set(simAssets.map((a) => a.id)))
    : null;

  return {
    name: scenario.name,
    assumptions,
    simAssets,
    leadTimes,
    locked: scenario.lockedWorkPlan && locked
      ? {
          planId: scenario.lockedWorkPlan.id,
          planName: scenario.lockedWorkPlan.name,
          count: locked.projects.length,
          outsideRun: locked.outsideRun,
        }
      : null,
    filter: scenario.savedFilter
      ? { id: scenario.savedFilter.id, name: scenario.savedFilter.name, assetCount: simAssets.length }
      : null,
    options: {
      library,
      combinations,
      selection,
      // Criticality is deliberately absent: it multiplies the benefit rather
      // than forming part of it. §5.3.
      benefitWeights: {
        conditionImprovement: weights.weights.conditionImprovement,
        riskReduction: weights.weights.riskReduction,
        lifeCycleSaving: weights.weights.lifeCycleCost,
      },
      categoryWeights: categories.weights,
      fundingPlan: funding.plan,
      curves,
      startYear: scenario.scenarioSet?.baseYear,
      // Absent when no formula is configured, in which case each asset keeps
      // its stored criticality for the whole run.
      criticality: criticality?.score,
      locked: locked?.projects,
    },
  };
}

/** Statuses a locked plan's projects are left out on: work no longer going
 * ahead, or not yet. */
const UNLOCKED_STATUSES: WorkPlanItemStatus[] = [WorkPlanItemStatus.CANCELLED, WorkPlanItemStatus.DEFERRED];

/**
 * A work plan's projects, as a scenario locks them.
 *
 * A project is one row, or the rows of one combination done as a visit. Only
 * projects on assets the run covers are locked: one on an asset outside the
 * scenario's filter, or no longer active, has nothing in the run to act on, and
 * is counted rather than silently dropped.
 */
async function lockedProjects(
  planId: string,
  inRun: Set<string>
): Promise<{ projects: LockedProject[]; outsideRun: number }> {
  const items = await prisma.workPlanItem.findMany({
    where: { workPlanId: planId, status: { notIn: UNLOCKED_STATUSES } },
    include: { asset: { select: { assetCode: true } }, treatment: { select: { name: true } } },
    orderBy: [{ year: "asc" }, { id: "asc" }],
  });

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.bundleId ?? item.id;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const projects: LockedProject[] = [];
  let outsideRun = 0;
  for (const [key, rows] of groups) {
    const first = rows[0];
    if (!inRun.has(first.assetId)) {
      outsideRun++;
      continue;
    }
    const fundedYear = first.year;
    projects.push({
      key,
      assetId: first.assetId,
      assetCode: first.asset.assetCode,
      label: first.bundleName ?? first.treatment.name,
      bundleName: first.bundleName,
      members: rows.map((r) => ({ treatment: r.treatment.name, cost: r.estimatedCost })),
      cost: rows.reduce((sum, r) => sum + r.estimatedCost, 0),
      // Null means the same as the year the money is spent.
      programmedYear: Math.min(first.programmedYear ?? fundedYear, fundedYear),
      fundedYear,
      buildYear: Math.max(first.buildYear ?? fundedYear, fundedYear),
      status: first.status,
    });
  }
  return { projects, outsideRun };
}

/**
 * Run a loaded scenario through the engine its lead times call for.
 *
 * One place, because there are two engines and every caller must choose
 * between them the same way: a scenario with no lead time set, or one whose
 * set leaves everything immediate, runs exactly as it always has. An editable
 * work plan made from a scenario goes through here too, so the plan and the
 * run it came from cannot disagree about when work happens.
 */
export function runForScenario(run: {
  simAssets: SimAsset[];
  assumptions: ScenarioAssumptions;
  options: ScenarioRunOptions;
  leadTimes: LeadTimes;
}): ScenarioRunResult {
  const delivery = !isImmediate(run.leadTimes);

  if (run.assumptions.fundingMode === "target") {
    // The search is the same question of either engine — run it at this
    // amount, see where the network is in the target year — so it is handed
    // the engine rather than duplicated for it.
    //
    // Both engines hold the target after the target year by buying only what
    // keeps the network there: the same-year engine in the year itself, the
    // delivery engine in the years its work will be built, paying where the
    // lead times put the money. Set to do nothing after the target, both stop.
    //
    // With lead times a target year that is out of reach usually means the
    // work cannot be built by then, so the run aims for the earliest year it
    // can be reached instead of buying everything in sight.
    return solveForTarget(
      run.simAssets,
      run.assumptions,
      run.options,
      (assets, assumptions, options) =>
        delivery
          ? runDeliveryScenario(assets, assumptions, { ...options, leadTimes: run.leadTimes })
          : runScenario(assets, assumptions, options),
      // A delivery run cannot be shortened to the target year without becoming
      // a different run — see solveForTarget.
      { shortProbe: !delivery, deferUnreachable: delivery }
    );
  }

  return delivery
    ? runDeliveryScenario(run.simAssets, run.assumptions, { ...run.options, leadTimes: run.leadTimes })
    : runScenario(run.simAssets, run.assumptions, run.options);
}

/** Run the simulation and replace this scenario's stored results. */
export async function runAndStoreScenario(organizationId: string, scenarioId: string): Promise<ScenarioRunResult> {
  const startedAt = Date.now();
  const run = await loadScenarioRun(organizationId, scenarioId);
  if (!run) throw new Error("Scenario not found");

  const result = runForScenario(run);

  await prisma.scenarioResult.deleteMany({ where: { scenarioId } });
  await prisma.scenarioResult.createMany({
    data: result.years.flatMap((y) => [
      { scenarioId, year: y.year, metricKey: "budget", metricValue: y.budget },
      { scenarioId, year: y.year, metricKey: "spend", metricValue: y.spend },
      { scenarioId, year: y.year, metricKey: "programmedSpend", metricValue: y.programmedSpend },
      { scenarioId, year: y.year, metricKey: "allocationSpend", metricValue: y.allocationSpend },
      { scenarioId, year: y.year, metricKey: "treatedCount", metricValue: y.treatedCount },
      { scenarioId, year: y.year, metricKey: "avgCondition", metricValue: y.avgCondition },
      { scenarioId, year: y.year, metricKey: "avgRisk", metricValue: y.avgRisk },
      { scenarioId, year: y.year, metricKey: "backlog", metricValue: y.backlog },
      { scenarioId, year: y.year, metricKey: "expectedFailures", metricValue: y.expectedFailures },
      { scenarioId, year: y.year, metricKey: "failureCost", metricValue: y.failureCost },
      { scenarioId, year: y.year, metricKey: "belowTargetCount", metricValue: y.belowTargetCount },
    ]),
  });
  // How the run got to its first year, stored against that year so no extra
  // year appears in the results. Only written when something was aged: its
  // absence means the run started from the network as measured.
  // What a delivery-lead-time run has to say about itself: work it paid for
  // but will not see built, and how many times it went round. Stored against
  // the first year, as the ageing figures are, so no extra year appears.
  if ("inFlight" in result && result.years.length > 0) {
    const delivery = result as DeliveryRunResult;
    const year = result.years[0].year;
    await prisma.scenarioResult.createMany({
      data: [
        { scenarioId, year, metricKey: "inFlightCount", metricValue: delivery.inFlight.length },
        { scenarioId, year, metricKey: "inFlightCost", metricValue: delivery.inFlightCost },
        { scenarioId, year, metricKey: "passes", metricValue: delivery.passes },
        { scenarioId, year, metricKey: "addedInLastPass", metricValue: delivery.addedInLastPass },
      ],
    });
  }
  // What was locked in, stored against the first year like the figures
  // around it, since it describes the run rather than one of its years.
  if (run.locked && result.years.length > 0) {
    const year = result.years[0].year;
    await prisma.scenarioResult.createMany({
      data: [
        { scenarioId, year, metricKey: "lockedCount", metricValue: run.locked.count },
        { scenarioId, year, metricKey: "lockedOutsideRun", metricValue: run.locked.outsideRun },
      ],
    });
  }
  // What a target-constrained run answered: the amount a year it takes, and
  // whether that got there. Against the first year for the same reason as the
  // rows above — it describes the run, not one of its years.
  if (result.target && result.years.length > 0) {
    const year = result.years[0].year;
    await prisma.scenarioResult.createMany({
      data: [
        { scenarioId, year, metricKey: "targetAnnualBudget", metricValue: result.target.annualBudget },
        { scenarioId, year, metricKey: "targetValue", metricValue: result.target.value },
        { scenarioId, year, metricKey: "targetInYears", metricValue: result.target.inYears },
        { scenarioId, year, metricKey: "targetAchieved", metricValue: result.target.achieved },
        { scenarioId, year, metricKey: "targetMetInYear", metricValue: result.target.metInYear ?? 0 },
        { scenarioId, year, metricKey: "targetReachable", metricValue: result.target.reachable ? 1 : 0 },
        // Stored as 0 for "the year asked", like targetMetInYear.
        { scenarioId, year, metricKey: "targetAimedFor", metricValue: result.target.aimedFor ?? 0 },
      ],
    });
  }
  if (result.agedYears > 0 && result.years.length > 0) {
    const year = result.years[0].year;
    await prisma.scenarioResult.createMany({
      data: [
        { scenarioId, year, metricKey: "agedYears", metricValue: result.agedYears },
        { scenarioId, year, metricKey: "conditionYearAvgCondition", metricValue: result.conditionYearAvgCondition },
        { scenarioId, year, metricKey: "startAvgCondition", metricValue: result.startAvgCondition },
      ],
    });
  }
  await persistScenarioProgram(organizationId, scenarioId, run.name, result, run.assumptions, run.locked?.planName ?? null);
  // Measured across everything the run actually did — loading, simulating and
  // persisting — because that is what the person waiting experiences. Written
  // only on success, so a failed run cannot poison the next estimate.
  const finishedAt = new Date();
  await prisma.scenario.update({
    where: { id: scenarioId },
    data: { updatedAt: finishedAt, lastRunAt: finishedAt, lastRunMs: Date.now() - startedAt },
  });

  return result;
}

/**
 * Run every scenario in a set, one after another.
 *
 * Sequential on purpose. Runs share the database connection pool and each
 * already saturates a core; running them side by side would not finish sooner
 * and would make each one's measured time — which every later estimate is
 * built on — meaningless.
 */
export async function runScenarioSet(organizationId: string, setId: string): Promise<number> {
  const members = await prisma.scenario.findMany({
    where: { organizationId, scenarioSetId: setId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  for (const m of members) await runAndStoreScenario(organizationId, m.id);
  return members.length;
}

/**
 * Materialize the projects a run actually funded as a WorkPlan linked to the
 * scenario. The schema already carries WorkPlan.scenarioId for exactly this;
 * a scenario run *is* a program of work, so storing it as one means the
 * project list is queryable and shows up wherever work plans do, rather than
 * being summarized away into yearly totals.
 *
 * This plan is the run's own record and is replaced whenever the scenario runs
 * again, so it is marked `isScenarioMirror` and is not a place to edit. An
 * editable plan made from the same scenario — see `createWorkPlanFromScenario`
 * — carries the flag false and is left alone here.
 */
async function persistScenarioProgram(
  organizationId: string,
  scenarioId: string,
  scenarioName: string,
  result: ScenarioRunResult,
  assumptions: ScenarioAssumptions,
  /** The plan locked projects came from, to say so on their rows. */
  lockedPlanName: string | null
) {
  // Only this run's own mirror. An editable plan someone made from the same
  // scenario is theirs — moved years, statuses and all — and a re-run must not
  // silently throw that away.
  const existing = await prisma.workPlan.findMany({
    where: { scenarioId, isScenarioMirror: true },
    select: { id: true },
  });
  if (existing.length > 0) {
    const ids = existing.map((w) => w.id);
    await prisma.workPlanItem.deleteMany({ where: { workPlanId: { in: ids } } });
    await prisma.workPlan.deleteMany({ where: { id: { in: ids } } });
  }

  // Locked projects are part of the programme the run reports: their money
  // is in its years, and their effects in its network.
  const years = result.years
    .map((y) => ({ ...y, selected: [...y.locked, ...y.selected] }))
    .filter((y) => y.selected.length > 0);
  if (years.length === 0) return;

  // By the asset's own type: a name alone could match another asset class's
  // treatment, or — before this was scoped — another organization's.
  const treatmentIdFor = await treatmentIdsForAssets(
    organizationId,
    years.flatMap((y) => y.selected.map((p) => p.assetId))
  );

  // The span of the money, not of the decisions: a row sits in the year it is
  // paid for, and with delivery lead times that is not the year it was chosen.
  const fundedYears = years.flatMap((y) => y.selected.map((p) => p.fundedYear));
  const workPlan = await prisma.workPlan.create({
    data: {
      scenarioId,
      name: `${scenarioName} — Funded Program`,
      startYear: Math.min(...fundedYears),
      endYear: Math.max(...fundedYears),
      isScenarioMirror: true,
      annualBudget: assumptions.annualBudget,
      fundingGrowth: assumptions.fundingGrowth,
    },
  });

  // A row names one treatment, so a funded bundle becomes one row per member
  // with the cost divided between them — the same shape the work plan
  // generator stores, and for the same reason. Matching the bundle's own
  // label against treatment names is what used to happen here, and a bundle
  // is not called after any treatment: every funded combination was silently
  // dropped, leaving the project list short of work the run had paid for.
  const items = years.flatMap((year) =>
    year.selected.flatMap((p) => {
      const isBundle = p.bundleName != null;
      // Keyed on the year the work is done, so two projects on one segment in
      // different years cannot collide even when both are the same bundle.
      const bundleId = isBundle ? `${workPlan.id}:${p.assetId}:${p.buildYear}:${p.treatment}` : null;

      return p.members.flatMap((member) => {
        const treatmentId = treatmentIdFor(p.assetId, member.treatment);
        if (!treatmentId) return [];
        return [
          {
            workPlanId: workPlan.id,
            assetId: p.assetId,
            treatmentId,
            bundleId,
            bundleName: p.bundleName,
            // `year` is the year the money comes out. Without delivery lead
            // times all three are the same year, which is every row written
            // before they existed.
            year: p.fundedYear,
            programmedYear: p.programmedYear,
            buildYear: p.buildYear,
            estimatedCost: member.cost,
            expectedBenefit: {
              // The effects belong to the whole visit, not to one member of
              // it: relining and anodes on the same main lift it once.
              conditionBefore: p.conditionBefore,
              conditionAfter: p.conditionAfter,
              riskBefore: p.riskBefore,
              riskAfter: p.riskAfter,
              riskReductionPct:
                p.riskBefore > 0 ? Math.round(((p.riskBefore - p.riskAfter) / p.riskBefore) * 1000) / 10 : 0,
              // Kept where the cost is spread over years, so a plan can show
              // the profile rather than only the year that carries most of it.
              // Absent in the usual case, where the row's own year is the
              // whole answer.
              ...(p.cash.length > 1 ? { cash: p.cash } : {}),
            },
            reasonExplanation: p.locked
              ? `Locked from ${lockedPlanName ?? "the locked work plan"}` +
                (isBundle ? ` as part of ${p.treatment}` : "") +
                `: programmed in ${p.programmedYear}, paid for in ${p.fundedYear}, built in ${p.buildYear}. ` +
                `The run left the segment alone from ${p.programmedYear} to ${p.buildYear}. ` +
                `Condition ${p.conditionBefore} → ${p.conditionAfter}, risk ${p.riskBefore} → ${p.riskAfter}.`
              : `Selected by the ${scenarioName} run in ${year.year}` +
              (isBundle ? ` as part of ${p.treatment}` : "") +
              (p.buildYear !== p.programmedYear
                ? `. Programmed in ${p.programmedYear}, paid for in ${p.fundedYear}, built in ${p.buildYear}`
                : "") +
              (p.supersededTreatment ? `, replacing ${p.supersededTreatment} programmed earlier on this segment` : "") +
              `. Condition ${p.conditionBefore} → ${p.conditionAfter}, risk ${p.riskBefore} → ${p.riskAfter}.`,
            fundingSource: p.locked ? "Programmed (locked)" : "Scenario Budget",
            status: (p.locked?.status as WorkPlanItemStatus | undefined) ?? WorkPlanItemStatus.PLANNED,
          },
        ];
      });
    })
  );

  if (items.length > 0) await prisma.workPlanItem.createMany({ data: items });
}

export type ScenarioProjectRow = {
  /** The year the money comes out. */
  year: number;
  /** Locked in from a work plan rather than chosen by the run. */
  locked: boolean;
  /** The year it was decided and the year it is built — the same year unless
   * the scenario ran with delivery lead times. */
  programmedYear: number;
  buildYear: number;
  assetId: string;
  assetCode: string;
  serviceArea: string | null;
  treatment: string;
  /** The bundle this row was part of, when the run funded a combination.
   * Several rows share it: one visit, one set of effects, one cost split
   * between them. */
  bundleName: string | null;
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
      locked: i.fundingSource === "Programmed (locked)",
      programmedYear: i.programmedYear ?? i.year,
      buildYear: i.buildYear ?? i.year,
      assetId: i.asset.id,
      assetCode: i.asset.assetCode,
      serviceArea: i.asset.location?.serviceArea ?? null,
      treatment: i.treatment.name,
      bundleName: i.bundleName,
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
  /** The criticality formula this scenario ranks its work plans by, when it
   * names one rather than following the asset type's active formula. */
  criticalityModelId: string | null;
  criticalityModelName: string | null;
  /** The named weighting this scenario ranks by, when it names one rather than
   * following the organization's default set. */
  weightSetId: string | null;
  weightSetName: string | null;
  /** The named category weighting this scenario leans by, when it names one
   * rather than following the organization's default set. */
  categoryWeightSetId: string | null;
  categoryWeightSetName: string | null;
  /** The named funding plan this scenario spends by, when it names one. Null
   * means no category limits, only the year's budget. */
  categoryFundingPlanId: string | null;
  categoryFundingPlanName: string | null;
  /** How long this scenario's work takes to be paid for and built, when it
   * names a set. Null follows the default, and no default means everything is
   * decided, paid for and built in the same year. */
  leadTimeSetId: string | null;
  leadTimeSetName: string | null;
  /** The saved filter deciding which assets this scenario runs over. Null is
   * the whole network, which is what every scenario did before filters could
   * be attached. */
  savedFilterId: string | null;
  savedFilterName: string | null;
  /** The work plan whose projects this scenario locks, if any. */
  lockedWorkPlanId: string | null;
  lockedWorkPlanName: string | null;
  /** What the stored run locked: how many projects, how many of the plan's
   * fell outside its assets, and what they spent across the run. Null when
   * the stored run locked nothing. */
  lockedRun: { count: number; outsideRun: number; programmedSpend: number } | null;
  /** What a target-constrained run answered. Null on a budget-constrained one,
   * and on a target run stored before these metrics were written. */
  target: {
    value: number;
    inYears: number;
    /** The flat annual amount the run solved for. On an unreachable target,
     * what its heaviest year spent. */
    annualBudget: number;
    achieved: number;
    metInYear: number | null;
    reachable: boolean;
    /** The year the run aimed for instead, counted from the start, when the
     * one asked for was out of reach and a later one was not. */
    aimedFor: number | null;
  } | null;
  /** Work the run paid for but never saw built, because its lead time carries
   * construction past the end. Null for a run with no lead times. */
  inFlightCount: number | null;
  inFlightCost: number | null;
  /** How many times the run went round, and whether the last pass still found
   * work to add — which is how an answer says it had not settled. */
  passes: number | null;
  addedInLastPass: number | null;
  /** When the stored results were produced, and how long that took. Null until
   * the scenario has run since these were recorded. */
  lastRunAt: Date | null;
  lastRunMs: number | null;
  updatedAt: Date;
  /** The set it belongs to, when it belongs to one. `assumptions` already
   * carries the set's planning period; this says where that came from. */
  scenarioSet: (ScenarioWindow & { id: string; name: string; status: ScenarioSetStatusValue }) | null;
  /** The analysis period stored on the scenario itself — what it runs over
   * outside a set, and what the edit form holds. */
  ownAnalysisPeriodYears: number;
  /** Stored results cover different years from the set's window, so they
   * describe a run this scenario would no longer make. */
  resultsOutOfWindow: boolean;
  /** Present when the stored run began in a later year than the network's
   * condition describes, and so aged the network forward first. */
  ageing: {
    fromYear: number;
    years: number;
    fromAvgCondition: number;
    toAvgCondition: number;
  } | null;
};

export async function listScenarios(
  organizationId: string,
  filter: { scenarioSetId?: string } = {}
): Promise<ScenarioSummary[]> {
  const scenarios = await prisma.scenario.findMany({
    where: { organizationId, ...(filter.scenarioSetId ? { scenarioSetId: filter.scenarioSetId } : {}) },
    include: {
      assumptions: true,
      results: true,
      scenarioSet: { select: { id: true, name: true, status: true, baseYear: true, planningPeriodYears: true } },
      criticalityModel: { select: { name: true } },
      weightSet: { select: { name: true } },
      categoryWeightSet: { select: { name: true } },
      categoryFundingPlan: { select: { name: true } },
      leadTimeSet: { select: { name: true } },
      savedFilter: { select: { name: true } },
      lockedWorkPlan: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return scenarios.map((s) => {
    const assumptions = effectiveAssumptions(s.assumptions, s.scenarioSet);
    const byMetric = (key: string) => s.results.filter((r) => r.metricKey === key).sort((a, b) => a.year - b.year);
    const conditions = byMetric("avgCondition");
    const backlogs = byMetric("backlog");
    const spends = byMetric("spend");
    const failures = byMetric("expectedFailures");
    const aged = byMetric("agedYears")[0];
    const inFlightCount = byMetric("inFlightCount")[0];
    const inFlightCost = byMetric("inFlightCost")[0];
    const passes = byMetric("passes")[0];
    const addedInLastPass = byMetric("addedInLastPass")[0];
    const agedFrom = byMetric("conditionYearAvgCondition")[0];
    const agedTo = byMetric("startAvgCondition")[0];
    // Written only by a target-constrained run, so its presence is what says
    // these results answered a target rather than a budget.
    const targetBudget = byMetric("targetAnnualBudget")[0];
    const targetMetIn = byMetric("targetMetInYear")[0];
    const lockedCount = byMetric("lockedCount")[0];

    return {
      id: s.id,
      name: s.name,
      description: s.description,
      assumptions,
      hasResults: s.results.length > 0,
      criticalityModelId: s.criticalityModelId,
      criticalityModelName: s.criticalityModel?.name ?? null,
      weightSetId: s.weightSetId,
      weightSetName: s.weightSet?.name ?? null,
      categoryWeightSetId: s.categoryWeightSetId,
      categoryWeightSetName: s.categoryWeightSet?.name ?? null,
      categoryFundingPlanId: s.categoryFundingPlanId,
      categoryFundingPlanName: s.categoryFundingPlan?.name ?? null,
      leadTimeSetId: s.leadTimeSetId,
      leadTimeSetName: s.leadTimeSet?.name ?? null,
      savedFilterId: s.savedFilterId,
      savedFilterName: s.savedFilter?.name ?? null,
      lockedWorkPlanId: s.lockedWorkPlanId,
      lockedWorkPlanName: s.lockedWorkPlan?.name ?? null,
      lockedRun: lockedCount
        ? {
            count: lockedCount.metricValue,
            outsideRun: byMetric("lockedOutsideRun")[0]?.metricValue ?? 0,
            programmedSpend: Math.round(byMetric("programmedSpend").reduce((sum, r) => sum + r.metricValue, 0)),
          }
        : null,
      target: targetBudget
        ? {
            value: byMetric("targetValue")[0]?.metricValue ?? goalOf(assumptions),
            inYears: byMetric("targetInYears")[0]?.metricValue ?? assumptions.targetInYears,
            annualBudget: targetBudget.metricValue,
            achieved: byMetric("targetAchieved")[0]?.metricValue ?? 0,
            // Stored as 0 for "never", since the metric column holds numbers.
            metInYear: targetMetIn && targetMetIn.metricValue > 0 ? targetMetIn.metricValue : null,
            reachable: (byMetric("targetReachable")[0]?.metricValue ?? 0) === 1,
            aimedFor: (byMetric("targetAimedFor")[0]?.metricValue ?? 0) || null,
          }
        : null,
      /** Work the run paid for that it never sees built, because its lead time
       * carries construction past the end. Null for a run with no lead times,
       * where no work can be in flight. */
      inFlightCount: inFlightCount?.metricValue ?? null,
      inFlightCost: inFlightCost?.metricValue ?? null,
      /** How many times the run went round, and whether the last pass was
       * still finding work — which is how an answer says it has not settled. */
      passes: passes?.metricValue ?? null,
      addedInLastPass: addedInLastPass?.metricValue ?? null,
      lastRunAt: s.lastRunAt,
      lastRunMs: s.lastRunMs,
      finalAvgCondition: conditions.at(-1)?.metricValue ?? null,
      finalBacklog: backlogs.at(-1)?.metricValue ?? null,
      totalSpend: spends.length ? Math.round(spends.reduce((sum, r) => sum + r.metricValue, 0)) : null,
      totalFailures: failures.length ? Math.round(failures.reduce((sum, r) => sum + r.metricValue, 0)) : null,
      conditionSeries: conditions.map((r) => ({ year: r.year, avgCondition: r.metricValue })),
      updatedAt: s.updatedAt,
      scenarioSet: s.scenarioSet,
      ownAnalysisPeriodYears: assumptionsFromRows(s.assumptions).analysisPeriodYears,
      resultsOutOfWindow: resultsOutOfWindow(
        conditions.map((r) => r.year),
        s.scenarioSet
      ),
      ageing:
        aged && agedFrom && agedTo
          ? {
              fromYear: aged.year - aged.metricValue,
              years: aged.metricValue,
              fromAvgCondition: agedFrom.metricValue,
              toAvgCondition: agedTo.metricValue,
            }
          : null,
    };
  });
}

export type ScenarioDetail = ScenarioSummary & {
  years: Array<{
    year: number;
    budget: number;
    spend: number;
    /** Locked projects' spending, and the run's own out of the allocation.
     * Runs stored before locked projects read as all allocation. */
    programmedSpend: number;
    allocationSpend: number;
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
        programmedSpend: m.programmedSpend ?? 0,
        allocationSpend: m.allocationSpend ?? (m.spend ?? 0) - (m.programmedSpend ?? 0),
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

  // The funded program a run materializes is the run's own record, and goes
  // with it. A plan someone made from the scenario does not: it is their
  // plan, edited perhaps, perhaps locked into another scenario, and deleting
  // the scenario it came from is not deleting it. It is kept and unlinked.
  const mirrors = await prisma.workPlan.findMany({
    where: { scenarioId, isScenarioMirror: true },
    select: { id: true },
  });
  const mirrorIds = mirrors.map((p) => p.id);

  await prisma.$transaction([
    prisma.workPlanItem.deleteMany({ where: { workPlanId: { in: mirrorIds } } }),
    prisma.workPlan.deleteMany({ where: { id: { in: mirrorIds } } }),
    prisma.workPlan.updateMany({ where: { scenarioId }, data: { scenarioId: null } }),
    prisma.scenarioResult.deleteMany({ where: { scenarioId } }),
    prisma.scenarioAssumption.deleteMany({ where: { scenarioId } }),
    prisma.scenario.delete({ where: { id: scenarioId } }),
  ]);
}

/**
 * Delete the scenarios ticked in a set, each as `deleteScenario` would. Only
 * the set's own members: the ids arrive from a form, and a scenario elsewhere
 * must not go because its id was posted here.
 */
export async function deleteSetScenarios(organizationId: string, setId: string, ids: string[]) {
  const members = await prisma.scenario.findMany({
    where: { id: { in: ids }, organizationId, scenarioSetId: setId },
    select: { id: true, name: true },
  });
  const deleted: string[] = [];
  for (const scenario of members) {
    await deleteScenario(organizationId, scenario.id);
    deleted.push(scenario.name);
  }
  return deleted;
}

/** How many editable plans were made from each scenario — kept, unlinked,
 * when it is deleted, which a confirmation should say. */
export async function plansMadeFrom(scenarioIds: string[]): Promise<Map<string, number>> {
  const rows = await prisma.workPlan.groupBy({
    by: ["scenarioId"],
    where: { scenarioId: { in: scenarioIds }, isScenarioMirror: false },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.scenarioId!, r._count._all]));
}

/** The utility's current annual capital budget, used for dashboard KPIs and
 * as the default when creating a scenario. */
/** A scenario's assumptions as it would run them — its set's window included.
 * For a work plan made from it, which reports against the same terms. */
export async function getScenarioAssumptions(
  organizationId: string,
  scenarioId: string
): Promise<ScenarioAssumptions | null> {
  const scenario = await prisma.scenario.findFirst({
    where: { id: scenarioId, organizationId },
    include: { assumptions: true, scenarioSet: { select: { baseYear: true, planningPeriodYears: true } } },
  });
  if (!scenario) return null;
  return effectiveAssumptions(scenario.assumptions, scenario.scenarioSet);
}

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
