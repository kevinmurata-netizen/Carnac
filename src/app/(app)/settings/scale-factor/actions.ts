"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import { readValueMaps } from "@/server/criticality";
import {
  saveScaleFactor,
  activateScaleFactor,
  deactivateScaleFactor,
  deleteScaleFactor,
  previewScaleFactor,
  type ScaleFactorPreview,
} from "@/server/scale-factors";
import type { SettingsActionState } from "../state";

const CARD = "/settings/scale-factor";

/**
 * A scale factor multiplies the Priority Score, so changing one changes what
 * every plan funds — the same bar as changing a criticality formula.
 */
async function requireWriteAccess() {
  return requireCardWrite(CARD, "Only an Administrator can change the scale factor");
}

/** The scale factor feeds ranking, so anything that ranks is stale once it
 * changes. */
function revalidateAffected() {
  for (const path of [CARD, "/treatment-planning", "/work-plan", "/scenario-planning"]) {
    revalidatePath(path);
  }
}

function parseMaps(raw: FormDataEntryValue | null): ReturnType<typeof readValueMaps> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    return readValueMaps(JSON.parse(raw));
  } catch {
    return {};
  }
}

export async function saveScaleFactorAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireWriteAccess();
    await saveScaleFactor(session.user.organizationId, {
      id: String(formData.get("id") ?? "").trim() || undefined,
      assetTypeId: String(formData.get("assetTypeId") ?? ""),
      name: String(formData.get("name") ?? ""),
      expression: String(formData.get("expression") ?? ""),
      valueMaps: parseMaps(formData.get("valueMaps")),
    });
    revalidateAffected();
    return { status: "success", message: "Saved. Activate it to make it the one that runs." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not save the scale factor" };
  }
}

export async function activateScaleFactorAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireWriteAccess();
    const id = String(formData.get("id") ?? "");
    const off = String(formData.get("deactivate") ?? "") === "true";

    if (off) {
      await deactivateScaleFactor(session.user.organizationId, id);
      revalidateAffected();
      return {
        status: "success",
        message: "Stood down. With none active every asset scales at 1, so the ranking stops accounting for size.",
      };
    }

    await activateScaleFactor(session.user.organizationId, id);
    revalidateAffected();
    return { status: "success", message: "Active. It applies the next time anything is ranked." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not activate the scale factor" };
  }
}

export async function deleteScaleFactorAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireWriteAccess();
    await deleteScaleFactor(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAffected();
    return { status: "success", message: "Scale factor deleted." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not delete the scale factor" };
  }
}

/**
 * Read-only, so it only needs to know you may see this card — trying a formula
 * out is how you find out whether it is worth saving, and requiring write
 * access to experiment would make that backwards.
 */
export async function previewScaleFactorAction(
  assetTypeId: string,
  expression: string,
  valueMaps: Record<string, Record<string, number>>
): Promise<ScaleFactorPreview> {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session) return { ok: false, error: "Sign in first" };

  const { getSessionPermissions } = await import("@/server/permissions");
  const permissions = await getSessionPermissions(session);
  if (!permissions.canRead(`card:${CARD}`)) return { ok: false, error: "Your role cannot see this page" };

  try {
    return await previewScaleFactor(session.user.organizationId, assetTypeId, expression, valueMaps);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not try that formula" };
  }
}
