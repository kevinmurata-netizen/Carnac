"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import {
  activateCriticalityModel,
  deactivateCriticalityModel,
  deleteCriticalityModel,
  previewFormula,
  saveCriticalityModel,
  readValueMaps,
  type FormulaPreview,
} from "@/server/criticality";
import type { SettingsActionState } from "../state";

const CARD = "/settings/criticality";
const DENIED = "Your role cannot change criticality formulas";

/** Criticality feeds work plan ranking, so a change here reaches the pages that
 * show what gets funded first. */
function revalidateAll() {
  for (const path of ["/settings/criticality", "/work-plan", "/risk", "/assets", "/treatment-planning"]) {
    revalidatePath(path);
  }
}

function parseValueMaps(raw: FormData): Record<string, Record<string, number>> {
  const json = String(raw.get("valueMaps") ?? "{}");
  try {
    return readValueMaps(JSON.parse(json));
  } catch {
    return {};
  }
}

export async function saveFormulaAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireCardWrite(CARD, DENIED);
    const id = String(formData.get("id") ?? "").trim();

    await saveCriticalityModel(session.user.organizationId, {
      id: id || undefined,
      assetTypeId: String(formData.get("assetTypeId") ?? ""),
      name: String(formData.get("name") ?? ""),
      expression: String(formData.get("expression") ?? ""),
      valueMaps: parseValueMaps(formData),
    });

    revalidateAll();
    return { status: "success", message: id ? "Formula saved." : "Formula created." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not save that formula" };
  }
}

export async function activateFormulaAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireCardWrite(CARD, DENIED);
    const id = String(formData.get("id") ?? "");
    const turnOff = String(formData.get("deactivate") ?? "") === "true";

    if (turnOff) {
      await deactivateCriticalityModel(session.user.organizationId, id);
      revalidateAll();
      return {
        status: "success",
        message: "Stood down. Criticality falls back to the consequence-of-failure rating until a formula is active.",
      };
    }

    await activateCriticalityModel(session.user.organizationId, id);
    revalidateAll();
    return {
      status: "success",
      message: "Active. It applies to every asset of this type the next time the model runs.",
    };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not change which formula is active" };
  }
}

export async function deleteFormulaAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireCardWrite(CARD, DENIED);
    await deleteCriticalityModel(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAll();
    return { status: "success", message: "Formula deleted." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not delete that formula" };
  }
}

/**
 * Runs a formula against every asset without saving it.
 *
 * Read-only, so it only needs to know you may see this card — trying a formula
 * out is how you find out whether it is worth saving, and requiring write
 * access to experiment would make that backwards.
 */
export async function previewFormulaAction(
  assetTypeId: string,
  expression: string,
  valueMaps: Record<string, Record<string, number>>
): Promise<FormulaPreview> {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session) return { ok: false, error: "Sign in first" };

  const { getSessionPermissions } = await import("@/server/permissions");
  const permissions = await getSessionPermissions(session);
  if (!permissions.canRead(`card:${CARD}`)) return { ok: false, error: "Your role cannot see this page" };

  try {
    return await previewFormula(session.user.organizationId, assetTypeId, expression, valueMaps);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not try that formula" };
  }
}
