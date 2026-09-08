"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import {
  createWeightSet,
  updateWeightSet,
  deleteWeightSet,
  setDefaultWeightSet,
  type WeightSetInput,
} from "@/server/weight-sets";
import type { ObjectiveWeights } from "@/domain/waterline/optimization";

/**
 * A weighting decides what the model calls "best", so changing one carries the
 * same bar as changing a treatment.
 */
async function requireWriteAccess() {
  return requireCardWrite("/settings/scenario-weights", "Only an Administrator can change scenario weights");
}

/** Weights feed every ranking, and a scenario or plan generated from now on
 * uses whatever these say. */
function revalidateAffected() {
  for (const path of ["/settings/scenario-weights", "/scenario-planning", "/work-plan"]) {
    revalidatePath(path);
  }
}

/** Entered as whole numbers because 30/40/20/10 reads better than 0.3/0.4/0.2/0.1;
 * normalization makes the two identical anyway. */
function parse(form: FormData): WeightSetInput {
  const num = (key: string) => {
    const raw = String(form.get(key) ?? "").trim();
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(n)) throw new Error(`"${key}" must be a number`);
    return n;
  };

  const weights: ObjectiveWeights = {
    conditionImprovement: num("conditionImprovement"),
    riskReduction: num("riskReduction"),
    lifeCycleCost: num("lifeCycleCost"),
    criticality: num("criticality"),
  };

  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? "").trim() || null,
    weights,
  };
}

export async function saveWeightSetAction(
  _prev: { status: string; message?: string },
  formData: FormData
): Promise<{ status: "idle" | "success" | "error"; message?: string }> {
  try {
    const session = await requireWriteAccess();
    const id = String(formData.get("id") ?? "").trim();
    const input = parse(formData);

    if (id) {
      await updateWeightSet(session.user.organizationId, id, input);
    } else {
      await createWeightSet(session.user.organizationId, input);
    }

    revalidateAffected();
    return {
      status: "success",
      message: id
        ? "Saved. Scenarios and work plans using this set rank by it from the next run."
        : "Created. Choose it on a scenario or when generating a work plan.",
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not save the weight set" };
  }
}

export async function setDefaultWeightSetAction(
  _prev: { status: string; message?: string },
  formData: FormData
): Promise<{ status: "idle" | "success" | "error"; message?: string }> {
  try {
    const session = await requireWriteAccess();
    await setDefaultWeightSet(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAffected();
    return { status: "success", message: "Default changed. Anything that did not choose a set now uses this one." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not change the default" };
  }
}

export async function deleteWeightSetAction(
  _prev: { status: string; message?: string },
  formData: FormData
): Promise<{ status: "idle" | "success" | "error"; message?: string }> {
  try {
    const session = await requireWriteAccess();
    await deleteWeightSet(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAffected();
    return { status: "success", message: "Weight set deleted." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not delete the weight set" };
  }
}
