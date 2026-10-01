"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { updateInspection } from "@/server/inspections";
import { addComponentFinding, updateComponentFinding } from "@/server/component-inspections";
import { INSPECTION_TYPES } from "@/domain/waterline/inspection";
import { parseDateInput } from "@/lib/format";

export type EditState = { status: "idle" | "success" | "error"; message?: string };

export async function saveInspectionAction(_prev: EditState, formData: FormData): Promise<EditState> {
  try {
    const session = await auth();
    if (!session) throw new Error("Sign in to edit this inspection");
    if (!canRecordFieldData(session)) throw new Error("Your role cannot edit inspection records");

    const id = String(formData.get("inspectionId") ?? "");
    if (!id) throw new Error("Missing inspection id");

    // Result values arrive as result:<id> so they stay separate from the
    // inspection's own columns.
    const results: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("result:")) results[key.slice(7)] = String(value ?? "");
    }

    const typeRaw = formData.has("inspectionType") ? String(formData.get("inspectionType") ?? "") : undefined;
    if (typeRaw !== undefined && typeRaw !== "" && !INSPECTION_TYPES.includes(typeRaw as never)) {
      throw new Error(`"${typeRaw}" is not a configured inspection type`);
    }

    const dateRaw = formData.has("inspectionDate") ? String(formData.get("inspectionDate") ?? "") : undefined;
    let inspectionDate: Date | undefined;
    if (dateRaw !== undefined) {
      const d = parseDateInput(dateRaw);
      if (!d) throw new Error("Inspection date is not valid");
      inspectionDate = d;
    }

    await updateInspection(session.user.organizationId, id, {
      inspectionDate,
      inspectionType: typeRaw || undefined,
      // The control only appears while unlocked, so an absent key means the
      // form never showed it rather than "not required".
      requiresFollowUp: formData.has("requiresFollowUp")
        ? formData.get("requiresFollowUp") === "true"
        : undefined,
      notes: formData.has("notes") ? String(formData.get("notes") ?? "").trim() || null : undefined,
      results,
    });

    revalidatePath(`/inspections/${id}`);
    revalidatePath("/inspections");
    revalidatePath("/condition");
    // A visit's date carries its components' readings with it, which moves
    // their snapshots on the asset pages.
    revalidatePath("/assets", "layout");
    return { status: "success", message: "Changes saved." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

// --- A component's findings on a visit -------------------------------------

/** Readings arrive as field:<fieldId>, with the notes beside them. */
function findingInput(formData: FormData) {
  const values = [...formData.entries()]
    .filter(([key]) => key.startsWith("field:"))
    .map(([key, value]) => ({ fieldId: key.slice(6), value: String(value ?? "") }));
  const notes = String(formData.get("notes") ?? "").trim();
  return { values, notes: notes || null };
}

async function requireInspectionEditor() {
  const session = await auth();
  if (!session) throw new Error("Sign in to edit this inspection");
  if (!canRecordFieldData(session)) throw new Error("Your role cannot edit inspection records");
  return session;
}

function revalidateVisit(visitId: string, assetId: string) {
  revalidatePath(`/inspections/${visitId}`);
  revalidatePath("/inspections");
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
}

export async function saveComponentFindingAction(_prev: EditState, formData: FormData): Promise<EditState> {
  try {
    const session = await requireInspectionEditor();
    const { visitId, assetId } = await updateComponentFinding(
      session.user.organizationId,
      String(formData.get("findingId") ?? ""),
      findingInput(formData)
    );
    if (visitId) revalidateVisit(visitId, assetId);
    return { status: "success", message: "Findings saved. The component's score follows its rating." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function addComponentFindingAction(_prev: EditState, formData: FormData): Promise<EditState> {
  try {
    const session = await requireInspectionEditor();
    const visitId = String(formData.get("visitId") ?? "");
    const { assetId } = await addComponentFinding(
      session.user.organizationId,
      visitId,
      String(formData.get("componentId") ?? ""),
      findingInput(formData)
    );
    revalidateVisit(visitId, assetId);
    return { status: "success", message: "Findings added to this visit." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Something went wrong" };
  }
}
