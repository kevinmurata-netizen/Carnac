"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCardWrite } from "@/server/guard";
import {
  createTreatment,
  updateTreatment,
  deleteTreatment,
  type TreatmentInput,
} from "@/server/treatment-config";
import type { TreatmentCategory } from "@/domain/waterline/treatment";
import type { TreatmentActionState } from "./state";

async function requireWriteAccess() {
  return requireCardWrite("/settings/treatments", "Only an Administrator can change the treatment library");
}

/** Treatments feed recommendations, LCCA, work plans and scenarios. */
function revalidateAffected() {
  for (const path of [
    "/settings/treatments",
    "/treatment-planning",
    "/work-plan",
    "/scenario-planning",
    "/assets",
  ]) {
    revalidatePath(path);
  }
}

const CATEGORIES: TreatmentCategory[] = ["Assess", "Repair", "Rehabilitate", "Renew", "Retire"];

function num(form: FormData, key: string, fallback = 0): number {
  const raw = String(form.get(key) ?? "").trim();
  if (raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`"${key}" must be a number`);
  return n;
}

function optionalNum(form: FormData, key: string): number | null {
  const raw = String(form.get(key) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`"${key}" must be a number`);
  return n;
}

function parseInput(form: FormData): TreatmentInput {
  const category = String(form.get("category") ?? "Repair") as TreatmentCategory;
  const effectMode = String(form.get("effectMode") ?? "gain");
  const effectValue = optionalNum(form, "effectValue");

  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? ""),
    category: CATEGORIES.includes(category) ? category : "Repair",
    applicableConditionMin: num(form, "applicableConditionMin", 0),
    applicableConditionMax: num(form, "applicableConditionMax", 100),
    applicableMaterials: String(form.get("applicableMaterials") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    applicableDiameterMin: optionalNum(form, "applicableDiameterMin"),
    applicableDiameterMax: optionalNum(form, "applicableDiameterMax"),
    conditionResetTo: effectMode === "reset" ? effectValue : null,
    conditionGain: effectMode === "gain" ? effectValue : null,
    failureProbMultiplier: num(form, "failureProbMultiplier", 1),
    expectedLifeExtension: num(form, "expectedLifeExtension", 0),
    unitCost: num(form, "unitCost", 0),
    costUnit: String(form.get("costUnit") ?? "per each") === "per LF" ? "per LF" : "per each",
    mobilizationCost: num(form, "mobilizationCost", 0),
    annualMaintenanceCost: num(form, "annualMaintenanceCost", 0),
    usefulLife: num(form, "usefulLife", 0),
    implementationConstraints: String(form.get("implementationConstraints") ?? "").trim() || null,
  };
}

export async function saveTreatmentAction(
  _prev: TreatmentActionState,
  formData: FormData
): Promise<TreatmentActionState> {
  try {
    const session = await requireWriteAccess();
    await updateTreatment(session.user.organizationId, String(formData.get("id") ?? ""), parseInput(formData));
    revalidateAffected();
    return { status: "success", message: "Treatment saved. Recommendations and plans will use it from now on." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not save treatment" };
  }
}

export async function createTreatmentAction(
  _prev: TreatmentActionState,
  formData: FormData
): Promise<TreatmentActionState> {
  try {
    const session = await requireWriteAccess();
    await createTreatment(session.user.organizationId, parseInput(formData));
    revalidateAffected();
    return { status: "success", message: "Treatment created." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not create treatment" };
  }
}

export async function deleteTreatmentAction(
  _prev: TreatmentActionState,
  formData: FormData
): Promise<TreatmentActionState> {
  try {
    const session = await requireWriteAccess();
    await deleteTreatment(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAffected();
    return { status: "success", message: "Treatment deleted." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not delete treatment" };
  }
}

export async function goToTreatmentAction(formData: FormData) {
  redirect(`/settings/treatments/${String(formData.get("id") ?? "")}`);
}
