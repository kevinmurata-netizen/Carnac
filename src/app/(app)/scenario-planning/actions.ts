"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { createScenario, updateScenario, runAndStoreScenario, deleteScenario } from "@/server/scenarios";
import { setScenarioOptions } from "@/server/scenario-options";
import {
  STRATEGIES,
  DEFAULT_ASSUMPTIONS,
  type Strategy,
  type ScenarioAssumptions,
} from "@/domain/waterline/scenario";

const schema = z.object({
  name: z.string().min(1, "Scenario name is required"),
  description: z.string().optional(),
  annualBudget: z.coerce.number().min(0, "Budget must be zero or more"),
  fundingGrowthPct: z.coerce.number().min(-50).max(50),
  discountRatePct: z.coerce.number().min(0).max(25),
  analysisPeriodYears: z.coerce.number().int().min(1).max(50),
  // Optional: a budget scenario may have no target at all. An emptied box
  // arrives as "", which z.coerce would turn into a target of 0.
  conditionTarget: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0, "The condition target must be 0 or more").max(100, "The condition target is at most 100").optional()
  ),
  hasConditionTarget: z.string().optional(),
  riskThreshold: z.coerce.number().min(0).max(25),
  strategy: z.string(),
  criticalityModelId: z.string().optional(),
  weightSetId: z.string().optional(),
  categoryWeightSetId: z.string().optional(),
  categoryFundingPlanId: z.string().optional(),
  leadTimeSetId: z.string().optional(),
  savedFilterId: z.string().optional(),
  scenarioSetId: z.string().optional(),
  fundingMode: z.string().optional(),
  targetInYears: z.coerce.number().int().min(1).max(50).optional(),
  afterTarget: z.string().optional(),
  lockedWorkPlanId: z.string().optional(),
  programmedFunding: z.string().optional(),
});

/**
 * What the scenario may consider, off the checkbox lists.
 *
 * `getAll` rather than `get`: a checkbox group posts one entry per ticked box
 * and nothing at all when none are ticked, which is exactly the shape wanted
 * here — no ticks with the limit on genuinely means "consider nothing".
 */
function parseSelection(formData: FormData) {
  return {
    limitsOptions: String(formData.get("limitsOptions") ?? "") === "on",
    treatments: formData.getAll("treatmentOption").map(String),
    combinations: formData.getAll("combinationOption").map(String),
  };
}

/** Percentages are entered as whole numbers in the form but stored as rates. */
function parseForm(formData: FormData): {
  name: string;
  description?: string;
  assumptions: ScenarioAssumptions;
  criticalityModelId: string | null;
  weightSetId: string | null;
  categoryWeightSetId: string | null;
  categoryFundingPlanId: string | null;
  leadTimeSetId: string | null;
  savedFilterId: string | null;
  scenarioSetId: string | null;
  lockedWorkPlanId: string | null;
} {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid scenario settings");
  }
  const d = parsed.data;
  const strategy = (STRATEGIES as readonly string[]).includes(d.strategy)
    ? (d.strategy as Strategy)
    : "risk-based";

  // One target field. A target run cannot do without it — it is the goal. A
  // budget run may leave it off, and then there is simply no line to draw.
  const fundingMode = d.fundingMode === "target" ? "target" : "budget";
  const wantsTarget = fundingMode === "target" || d.hasConditionTarget === "on";
  if (wantsTarget && d.conditionTarget == null) {
    throw new Error(
      fundingMode === "target"
        ? "A target-constrained scenario needs a condition target to reach"
        : "Enter a condition target, or untick Show a condition target"
    );
  }

  return {
    name: d.name,
    description: d.description,
    // An empty select means "follow the asset type", not "a formula with no id".
    criticalityModelId: d.criticalityModelId?.trim() || null,
    // Likewise: empty means "the organization's default", not "no weighting".
    weightSetId: d.weightSetId?.trim() || null,
    categoryWeightSetId: d.categoryWeightSetId?.trim() || null,
    // Empty means "no category limits", which is a real choice here rather
    // than a missing one — it is how allocation worked before order existed.
    categoryFundingPlanId: d.categoryFundingPlanId?.trim() || null,
    // Empty means the organization's default lead times, and no default means
    // everything is decided, paid for and built in the same year.
    leadTimeSetId: d.leadTimeSetId?.trim() || null,
    // Empty means the whole network, which is what every scenario ran over
    // before a filter could be attached.
    savedFilterId: d.savedFilterId?.trim() || null,
    // Empty means "not in a set". The server checks the set belongs to this
    // organization before joining it.
    scenarioSetId: d.scenarioSetId?.trim() || null,
    // Empty means nothing locked: the run decides every project.
    lockedWorkPlanId: d.lockedWorkPlanId?.trim() || null,
    assumptions: {
      annualBudget: d.annualBudget,
      fundingGrowth: d.fundingGrowthPct / 100,
      discountRate: d.discountRatePct / 100,
      analysisPeriodYears: d.analysisPeriodYears,
      conditionTarget: wantsTarget ? (d.conditionTarget ?? null) : null,
      riskThreshold: d.riskThreshold,
      strategy,
      fundingMode,
      targetMetric: "avgCondition",
      // Held inside the run: a target in year 25 of a 20-year run could never
      // be answered.
      targetInYears: Math.max(1, Math.min(d.targetInYears ?? DEFAULT_ASSUMPTIONS.targetInYears, d.analysisPeriodYears)),
      afterTarget: d.afterTarget === "none" ? "none" : "hold",
      programmedFunding: d.programmedFunding === "additional" ? "additional" : "within",
    },
  };
}

export async function createScenarioAction(formData: FormData) {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) {
    throw new Error("You do not have permission to create scenarios");
  }

  const input = parseForm(formData);
  // Sets come first: a new scenario is always created inside one, from that
  // set's page. The server checks the set belongs to this organization.
  if (!input.scenarioSetId) throw new Error("Create a scenario from its scenario set");
  const scenario = await createScenario(session.user.organizationId, input);
  // Written before the run, so the first run already honours the selection
  // rather than producing results the scenario's own settings contradict.
  await setScenarioOptions(session.user.organizationId, scenario.id, parseSelection(formData));

  await runAndStoreScenario(session.user.organizationId, scenario.id);
  redirect(`/scenario-planning/${scenario.id}`);
}

/**
 * Save edited parameters and immediately re-run. Saving without re-running
 * would leave stored results that no longer match the assumptions shown beside
 * them, so the two always move together.
 */
export async function updateScenarioAction(formData: FormData) {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) {
    throw new Error("You do not have permission to edit scenarios");
  }
  const id = String(formData.get("scenarioId") ?? "");
  if (!id) throw new Error("Scenario id is required");

  await updateScenario(session.user.organizationId, id, parseForm(formData));
  await setScenarioOptions(session.user.organizationId, id, parseSelection(formData));
  await runAndStoreScenario(session.user.organizationId, id);

  // Layout, so a set page listing this scenario is refreshed too — joining or
  // leaving a set changes both sides.
  revalidatePath("/scenario-planning", "layout");
}

export async function rerunScenarioAction(formData: FormData) {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) {
    throw new Error("You do not have permission to run scenarios");
  }
  const id = String(formData.get("scenarioId") ?? "");
  if (!id) throw new Error("Scenario id is required");

  await runAndStoreScenario(session.user.organizationId, id);
  revalidatePath("/scenario-planning", "layout");
}

export async function deleteScenarioAction(formData: FormData) {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) {
    throw new Error("You do not have permission to delete scenarios");
  }
  const id = String(formData.get("scenarioId") ?? "");
  if (!id) throw new Error("Scenario id is required");

  await deleteScenario(session.user.organizationId, id);
  redirect("/scenario-planning");
}
