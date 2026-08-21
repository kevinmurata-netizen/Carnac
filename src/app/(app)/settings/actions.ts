"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  updateConditionModel,
  updateRiskModel,
  updateDeteriorationModel,
  updateAssetType,
  createAssetType,
  updateInspectionTemplate,
  createFailureType,
  updateFailureType,
  deleteFailureType,
} from "@/server/settings";
import { updateNavLabels, resetNavLabels } from "@/server/navigation";
import { createMetric, updateMetric, deleteMetric } from "@/server/metrics";
import type { ConditionBand } from "@/domain/waterline/condition";
import type { SettingsActionState } from "./state";

/** Modelling configuration is Administrator-only: these values sit underneath
 * every condition, risk and forecast number the system reports. */
async function requireAdministrator() {
  const session = await auth();
  if (!session || session.user.roleName !== "Administrator") {
    throw new Error("Only an Administrator can change settings");
  }
  return session;
}

/** Config changes ripple into every derived view, so revalidate broadly rather
 * than just the page that was edited. */
function revalidateAll(...extra: string[]) {
  for (const path of [
    "/settings",
    "/dashboard",
    "/condition",
    "/risk",
    "/assets",
    "/network",
    "/inspections",
    "/deterioration-models",
    "/treatment-planning",
    "/scenario-planning",
    "/work-plan",
    "/reports",
    ...extra,
  ]) {
    revalidatePath(path);
  }
}

function fail(e: unknown): SettingsActionState {
  return { status: "error", message: e instanceof Error ? e.message : "Something went wrong" };
}

function num(formData: FormData, key: string): number {
  return Number(formData.get(key) ?? 0);
}

// ---------------------------------------------------------------------------

export async function saveConditionModelAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();

    const bands: ConditionBand[] = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("bandLabel_")) continue;
      const i = key.slice("bandLabel_".length);
      const label = String(value).trim();
      if (!label) continue;
      bands.push({
        label,
        min: num(formData, `bandMin_${i}`),
        max: num(formData, `bandMax_${i}`),
        color: String(formData.get(`bandColor_${i}`) ?? "#888888"),
      });
    }

    await updateConditionModel(session.user.organizationId, {
      name: String(formData.get("name") ?? ""),
      scaleMin: num(formData, "scaleMin"),
      scaleMax: num(formData, "scaleMax"),
      bands,
    });

    revalidateAll("/settings/condition-models");
    return { status: "success", message: `Saved — ${bands.length} bands now in effect across the system.` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveRiskModelAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();

    const pof: Record<string, number> = {};
    const cof: Record<string, number> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("pof_")) pof[key.slice(4)] = Number(value);
      if (key.startsWith("cof_")) cof[key.slice(4)] = Number(value);
    }

    await updateRiskModel(session.user.organizationId, {
      name: String(formData.get("name") ?? ""),
      pof,
      cof,
    });

    revalidateAll("/settings/risk-models");
    return {
      status: "success",
      message: "Saved. Weights apply to the next risk recompute — existing assessments keep the weights they were scored with.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function saveDeteriorationModelAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    const id = String(formData.get("id") ?? "");

    await updateDeteriorationModel(session.user.organizationId, id, {
      name: String(formData.get("name") ?? ""),
      isActive: formData.get("isActive") === "on",
      curve: {
        initialCondition: num(formData, "initialCondition"),
        minCondition: num(formData, "minCondition"),
        serviceLife: num(formData, "serviceLife"),
        shape: num(formData, "shape"),
      },
    });

    revalidateAll("/settings/deterioration-models");
    return { status: "success", message: "Saved — forecasts and scenario runs now use this curve." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveAssetTypeAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    await updateAssetType(session.user.organizationId, String(formData.get("id") ?? ""), {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
    });
    revalidateAll("/settings/configuration");
    return { status: "success", message: "Asset type updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function createAssetTypeAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    await createAssetType(session.user.organizationId, {
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
    });
    revalidateAll("/settings/configuration");
    return {
      status: "success",
      message: "Asset type created. It has no attributes, inspection template or models yet — add those before recording assets against it.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function saveTemplateAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    await updateInspectionTemplate(session.user.organizationId, String(formData.get("id") ?? ""), {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      isActive: formData.get("isActive") === "on",
    });
    revalidateAll("/settings/configuration");
    return { status: "success", message: "Inspection template updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function createFailureTypeAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    await createFailureType(session.user.organizationId, {
      code: String(formData.get("code") ?? ""),
      label: String(formData.get("label") ?? ""),
    });
    revalidateAll("/settings/failure-types");
    return { status: "success", message: "Failure type added." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveFailureTypesAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    let count = 0;
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("label_")) continue;
      await updateFailureType(session.user.organizationId, key.slice("label_".length), {
        label: String(value),
      });
      count++;
    }
    revalidateAll("/settings/failure-types");
    return { status: "success", message: `Saved ${count} failure type${count === 1 ? "" : "s"}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFailureTypeAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    await deleteFailureType(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAll("/settings/failure-types");
    return { status: "success", message: "Failure type removed." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveNavLabelsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();

    const labels: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("label_")) continue;
      labels[key.slice("label_".length)] = String(value);
    }

    await updateNavLabels(session.user.organizationId, labels);

    // Page names appear in the sidebar and breadcrumbs, which the app layout
    // renders — so the whole tree has to revalidate, not just this page.
    revalidatePath("/", "layout");
    return { status: "success", message: "Page names saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function resetNavLabelsAction(
  _prev: SettingsActionState,
  _formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    await resetNavLabels(session.user.organizationId);
    revalidatePath("/", "layout");
    return { status: "success", message: "All page names reset to their defaults." };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Bands arrive as bandLabel_<key> / bandMin_<key> / bandMax_<key> / bandColor_<key>. */
function readBands(formData: FormData, prefix = "band"): ConditionBand[] {
  const bands: ConditionBand[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(`${prefix}Label_`)) continue;
    const i = key.slice(`${prefix}Label_`.length);
    const label = String(value).trim();
    if (!label) continue;
    bands.push({
      label,
      min: num(formData, `${prefix}Min_${i}`),
      max: num(formData, `${prefix}Max_${i}`),
      color: String(formData.get(`${prefix}Color_${i}`) ?? "#888888"),
    });
  }
  return bands;
}

export async function createMetricAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    const source = String(formData.get("source") ?? "");
    const [sourceKind, sourceCode] = source.split(":");

    if (sourceKind !== "inspection" && sourceKind !== "inventory") {
      return { status: "error", message: "Choose a field for this metric to measure." };
    }

    await createMetric(session.user.organizationId, {
      name: String(formData.get("name") ?? ""),
      sourceKind,
      sourceCode,
      scaleMin: num(formData, "scaleMin"),
      scaleMax: num(formData, "scaleMax"),
      bands: readBands(formData),
    });

    revalidateAll("/settings/condition-models");
    return { status: "success", message: "Metric created — it is measuring live data now." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveMetricAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    await updateMetric(session.user.organizationId, String(formData.get("id") ?? ""), {
      name: String(formData.get("name") ?? ""),
      scaleMin: num(formData, "scaleMin"),
      scaleMax: num(formData, "scaleMax"),
      bands: readBands(formData),
    });

    revalidateAll("/settings/condition-models");
    return { status: "success", message: "Metric saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMetricAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const session = await requireAdministrator();
    await deleteMetric(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAll("/settings/condition-models");
    return { status: "success", message: "Metric removed." };
  } catch (e) {
    return fail(e);
  }
}
