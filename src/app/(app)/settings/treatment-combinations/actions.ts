"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { createCombination, updateCombination, deleteCombination } from "@/server/combinations";

/** Combinations decide what the model may propose and what it costs, so
 * changing them carries the same bar as changing a treatment. */
async function requireWriteAccess() {
  return requireCardWrite(
    "/settings/treatment-combinations",
    "Only an Administrator can change treatment combinations"
  );
}

function revalidateEverything(id?: string) {
  for (const path of [
    "/settings/treatment-combinations",
    ...(id ? [`/settings/treatment-combinations/${id}`] : []),
    "/settings/treatments",
    "/treatment-planning",
    "/work-plan",
    "/scenario-planning",
    "/model-results",
    "/assets",
  ]) {
    revalidatePath(path);
  }
}

export type CombinationPayload = {
  id: string | null;
  name: string;
  description: string;
  enabled: boolean;
  qualifyMode: "any" | "all";
  /** Null keeps the inferred figure rather than meaning "free". */
  mobilizationCost: number | null;
  members: Array<{ treatmentId: string; required: boolean }>;
  ruleIds: string[];
};

export async function saveCombinationAction(
  payload: CombinationPayload
): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    const session = await requireWriteAccess();

    const input = {
      name: payload.name,
      description: payload.description,
      enabled: Boolean(payload.enabled),
      qualifyMode: payload.qualifyMode === "any" ? ("any" as const) : ("all" as const),
      // An empty box means "keep inferring", not "costs nothing" — so only a
      // real number is taken, and anything else falls back to null.
      mobilizationCost:
        typeof payload.mobilizationCost === "number" && Number.isFinite(payload.mobilizationCost)
          ? payload.mobilizationCost
          : null,
      members: Array.isArray(payload.members) ? payload.members : [],
      ruleIds: Array.isArray(payload.ruleIds) ? payload.ruleIds : [],
    };

    let id = payload.id;
    if (id) await updateCombination(session.user.organizationId, id, input);
    else id = await createCombination(session.user.organizationId, input);

    revalidateEverything(id);

    return {
      ok: true,
      id,
      message: payload.enabled
        ? "Saved. This bundle is offered alongside its members from the next run — it does not replace them."
        : "Saved, and left disabled — it is never offered until you enable it.",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
}

export async function deleteCombinationAction(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const session = await requireWriteAccess();
    await deleteCombination(session.user.organizationId, id);
    revalidateEverything();
    return {
      ok: true,
      message: "Deleted. Work plans already generated keep their rows — they record what was decided.",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not delete" };
  }
}
