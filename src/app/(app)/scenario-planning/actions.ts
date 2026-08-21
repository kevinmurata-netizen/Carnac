"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { createScenario, updateScenario, runAndStoreScenario, deleteScenario } from "@/server/scenarios";
import { STRATEGIES, type Strategy, type ScenarioAssumptions } from "@/domain/waterline/scenario";

const schema = z.object({
  name: z.string().min(1, "Scenario name is required"),
  description: z.string().optional(),
  annualBudget: z.coerce.number().min(0, "Budget must be zero or more"),
  fundingGrowthPct: z.coerce.number().min(-50).max(50),
  discountRatePct: z.coerce.number().min(0).max(25),
  analysisPeriodYears: z.coerce.number().int().min(1).max(50),
  conditionTarget: z.coerce.number().min(0).max(100),
  riskThreshold: z.coerce.number().min(0).max(25),
  strategy: z.string(),
});

/** Percentages are entered as whole numbers in the form but stored as rates. */
function parseForm(formData: FormData): {
  name: string;
  description?: string;
  assumptions: ScenarioAssumptions;
} {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid scenario settings");
  }
  const d = parsed.data;
  const strategy = (STRATEGIES as readonly string[]).includes(d.strategy)
    ? (d.strategy as Strategy)
    : "risk-based";

  return {
    name: d.name,
    description: d.description,
    assumptions: {
      annualBudget: d.annualBudget,
      fundingGrowth: d.fundingGrowthPct / 100,
      discountRate: d.discountRatePct / 100,
      analysisPeriodYears: d.analysisPeriodYears,
      conditionTarget: d.conditionTarget,
      riskThreshold: d.riskThreshold,
      strategy,
    },
  };
}

export async function createScenarioAction(formData: FormData) {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) {
    throw new Error("You do not have permission to create scenarios");
  }

  const scenario = await createScenario(session.user.organizationId, parseForm(formData));

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
  await runAndStoreScenario(session.user.organizationId, id);

  revalidatePath(`/scenario-planning/${id}`);
  revalidatePath("/scenario-planning");
}

export async function rerunScenarioAction(formData: FormData) {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) {
    throw new Error("You do not have permission to run scenarios");
  }
  const id = String(formData.get("scenarioId") ?? "");
  if (!id) throw new Error("Scenario id is required");

  await runAndStoreScenario(session.user.organizationId, id);
  revalidatePath(`/scenario-planning/${id}`);
  revalidatePath("/scenario-planning");
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
