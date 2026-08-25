"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { updateInspection } from "@/server/inspections";
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
    return { status: "success", message: "Changes saved." };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Something went wrong" };
  }
}
