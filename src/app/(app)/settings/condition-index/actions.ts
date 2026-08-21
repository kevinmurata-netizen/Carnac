"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  updateComponentWeights,
  addComponent,
  addExistingFieldAsComponent,
  removeComponent,
  recalculateConditionScores,
} from "@/server/condition-model";
import type { IndexActionState } from "./state";

/** Configuration changes are Administrator-only: reweighting the index moves
 * every condition score in the system. */
async function requireAdministrator() {
  const session = await auth();
  if (!session || session.user.roleName !== "Administrator") {
    throw new Error("Only an Administrator can change the condition index");
  }
  return session;
}

function revalidateAffected() {
  // Condition drives risk, deterioration, treatment and planning views.
  for (const path of ["/settings/condition-index", "/condition", "/dashboard", "/risk", "/assets"]) {
    revalidatePath(path);
  }
}

export async function saveWeightsAction(_prev: IndexActionState, formData: FormData): Promise<IndexActionState> {
  try {
    const session = await requireAdministrator();
    const weights: Record<string, number> = {};
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("weight_")) continue;
      const code = key.slice("weight_".length);
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        return { status: "error", message: `Weight for ${code} must be zero or greater.` };
      }
      weights[code] = n;
    }

    await updateComponentWeights(session.user.organizationId, weights);
    revalidateAffected();
    return {
      status: "success",
      message: "Weights saved. Existing scores still reflect the previous weights — recalculate to bring them in line.",
      staleScores: true,
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not save weights" };
  }
}

export async function addComponentAction(_prev: IndexActionState, formData: FormData): Promise<IndexActionState> {
  try {
    const session = await requireAdministrator();
    const existingCode = String(formData.get("existingFieldCode") ?? "").trim();
    const weight = Number(formData.get("weight"));
    if (!Number.isFinite(weight) || weight < 0) {
      return { status: "error", message: "Weight must be a number of zero or greater." };
    }

    if (existingCode) {
      await addExistingFieldAsComponent(session.user.organizationId, existingCode, weight);
    } else {
      await addComponent(session.user.organizationId, {
        code: String(formData.get("code") ?? ""),
        label: String(formData.get("label") ?? ""),
        weight,
        helpText: String(formData.get("helpText") ?? ""),
      });
    }

    revalidateAffected();
    revalidatePath("/inspections/new");
    return {
      status: "success",
      message: existingCode
        ? "Component added to the index."
        : "Component added, along with the inspection field that collects it.",
      staleScores: true,
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not add component" };
  }
}

export async function removeComponentAction(_prev: IndexActionState, formData: FormData): Promise<IndexActionState> {
  try {
    const session = await requireAdministrator();
    const code = String(formData.get("code") ?? "");
    await removeComponent(session.user.organizationId, code);
    revalidateAffected();
    return {
      status: "success",
      message: `"${code}" removed from the index. Its inspection field and recorded answers were kept.`,
      staleScores: true,
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not remove component" };
  }
}

export async function recalculateAction(_prev: IndexActionState, _formData: FormData): Promise<IndexActionState> {
  try {
    const session = await requireAdministrator();
    const result = await recalculateConditionScores(session.user.organizationId);
    revalidateAffected();
    return {
      status: "success",
      message: `Replayed ${result.inspectionsScored} inspection(s); ${result.measurementsUpdated} condition score(s) changed.`,
      staleScores: false,
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Recalculation failed" };
  }
}
