"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { createEffect, updateEffect, deleteEffect, deleteEffects } from "@/server/effects";
import type { EffectConditionMode } from "@/domain/waterline/effect";

/** What a treatment does decides what the model recommends, so changing an
 * effect carries the same bar as changing a treatment. */
async function requireWriteAccess() {
  return requireCardWrite("/settings/treatment-effects", "Only an Administrator can change treatment effects");
}

/** Every page an effect reaches: editing one shared by several treatments
 * changes all of them at once. */
function revalidateEverythingEffectsTouch() {
  for (const path of [
    "/settings/treatment-effects",
    "/settings/treatments",
    "/settings/treatment-combinations",
    "/treatment-planning",
    "/work-plan",
    "/scenario-planning",
    "/model-results",
    "/assets",
  ]) {
    revalidatePath(path, path === "/settings/treatments" ? "layout" : undefined);
  }
}

export type EffectPayload = {
  id: string | null;
  name: string;
  description: string;
  conditionMode: EffectConditionMode;
  conditionValue: number | null;
  failureProbMultiplier: number;
  expectedLifeExtension: number;
};

export async function saveEffectAction(
  payload: EffectPayload
): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    const session = await requireWriteAccess();
    const organizationId = session.user.organizationId;

    // Arrives from the browser, so every field is re-read into a known shape
    // rather than passed through; the server-side validator checks the values.
    const input = {
      name: String(payload?.name ?? ""),
      description: String(payload?.description ?? ""),
      conditionMode: (["reset", "gain", "none"].includes(payload?.conditionMode)
        ? payload.conditionMode
        : "none") as EffectConditionMode,
      conditionValue:
        typeof payload?.conditionValue === "number" && Number.isFinite(payload.conditionValue)
          ? payload.conditionValue
          : null,
      failureProbMultiplier: Number(payload?.failureProbMultiplier),
      expectedLifeExtension: Number(payload?.expectedLifeExtension),
    };

    let id = payload?.id ?? null;
    if (id) await updateEffect(organizationId, id, input);
    else id = await createEffect(organizationId, input);

    revalidateEverythingEffectsTouch();
    return { ok: true, id, message: payload.id ? "Saved. Every treatment using this effect uses the change." : "Created." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
}

export async function deleteEffectAction(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const session = await requireWriteAccess();
    await deleteEffect(session.user.organizationId, id);
    revalidateEverythingEffectsTouch();
    return { ok: true, message: "Deleted." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not delete" };
  }
}

export type BulkDeleteState = { status: "idle" | "success" | "error"; message: string | null };

/** Delete the effects ticked on the list, keeping any still in use and saying
 * why. A partial result reads as an error so it is never taken for the lot. */
export async function deleteEffectsAction(_prev: BulkDeleteState, formData: FormData): Promise<BulkDeleteState> {
  try {
    const session = await requireWriteAccess();
    const ids = formData.getAll("id").map(String).filter(Boolean);
    if (ids.length === 0) return { status: "error", message: "No effects were selected." };

    const { deleted, kept } = await deleteEffects(session.user.organizationId, ids);
    revalidateEverythingEffectsTouch();

    const deletedText =
      deleted.length === 0 ? "Nothing was deleted." : `Deleted ${deleted.length}: ${deleted.join(", ")}.`;
    if (kept.length === 0) return { status: "success", message: deletedText };
    return {
      status: "error",
      message: `${deletedText} Kept ${kept.length}, because deleting ${kept.length === 1 ? "it" : "them"} would change what those treatments do: ${kept
        .map((k) => `${k.name} (${k.reason})`)
        .join("; ")}.`,
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not delete those effects" };
  }
}
