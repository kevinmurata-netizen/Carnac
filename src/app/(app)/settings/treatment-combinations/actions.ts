"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import {
  createCombination,
  updateCombination,
  deleteCombination,
  deleteCombinations,
  copyCombinations,
} from "@/server/combinations";

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

export type BulkDeleteState = { status: "idle" | "success" | "error"; message: string | null };

/** Delete the combinations ticked on the list. */
/** The list's bar: Copy selected and Delete selected share one form, and the
 * button pressed says which. */
export async function bulkCombinationsAction(prev: BulkDeleteState, formData: FormData): Promise<BulkDeleteState> {
  return formData.get("intent") === "copy" ? copyCombinationsAction(formData) : deleteCombinationsAction(prev, formData);
}

async function copyCombinationsAction(formData: FormData): Promise<BulkDeleteState> {
  try {
    const session = await requireWriteAccess();
    const ids = formData.getAll("id").map(String).filter(Boolean);
    if (ids.length === 0) return { status: "error", message: "No combinations were selected." };
    const names = await copyCombinations(session.user.organizationId, ids);
    // Disabled copies change no option, so only the list needs refreshing.
    revalidatePath("/settings/treatment-combinations");
    return {
      status: "success",
      message: `Copied ${names.length}: ${names.join(", ")}. Copies start disabled, so the same bundle is not offered twice — change a copy, then enable it.`,
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not copy those combinations" };
  }
}

export async function deleteCombinationsAction(
  _prev: BulkDeleteState,
  formData: FormData
): Promise<BulkDeleteState> {
  try {
    const session = await requireWriteAccess();
    const ids = formData.getAll("id").map(String).filter(Boolean);
    if (ids.length === 0) return { status: "error", message: "No combinations were selected." };

    const deleted = await deleteCombinations(session.user.organizationId, ids);
    revalidateEverything();
    return {
      status: "success",
      message:
        deleted.length === 0
          ? "Nothing was deleted — those combinations no longer exist."
          : `Deleted ${deleted.length}: ${deleted.join(", ")}. Their treatments are still offered on their own, and work plans already generated keep their rows.`,
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not delete those combinations" };
  }
}
