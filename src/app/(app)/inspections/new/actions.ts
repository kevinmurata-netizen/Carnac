"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { createInspection, getWaterlineTemplate } from "@/server/inspections";

const baseSchema = z.object({
  assetId: z.string().min(1, "Select an asset"),
  templateId: z.string().min(1),
  inspectionDate: z.string().min(1, "Inspection date is required"),
  inspectionType: z.string().min(1),
  requiresFollowUp: z.literal("on").optional(),
  notes: z.string().optional(),
  gpsLat: z.string().optional(),
  gpsLng: z.string().optional(),
});

export async function createInspectionAction(formData: FormData) {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) {
    throw new Error("You do not have permission to record inspections");
  }
  const organizationId = session.user.organizationId;

  const parsed = baseSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid inspection data");
  }
  const data = parsed.data;

  const template = await getWaterlineTemplate(organizationId);
  const fieldValues = template.fields.flatMap((field) => {
    const raw = formData.get(`field_${field.id}`);
    if (raw == null || raw === "") return [];
    return [{ fieldId: field.id, code: field.code, dataType: field.dataType, value: String(raw) }];
  });

  for (const field of template.fields) {
    if (!field.isRequired) continue;
    const found = fieldValues.find((f) => f.fieldId === field.id);
    if (!found) throw new Error(`${field.label} is required`);
    if (field.dataType === "NUMBER") {
      const n = Number(found.value);
      if (Number.isNaN(n) || n < 0 || n > 10) {
        throw new Error(`${field.label} must be between 0 and 10`);
      }
    }
  }

  const inspection = await createInspection(organizationId, {
    assetId: data.assetId,
    templateId: data.templateId,
    inspectorId: session.user.id!,
    inspectionDate: new Date(data.inspectionDate),
    inspectionType: data.inspectionType,
    requiresFollowUp: data.requiresFollowUp === "on",
    notes: data.notes,
    gpsLat: data.gpsLat ? Number(data.gpsLat) : undefined,
    gpsLng: data.gpsLng ? Number(data.gpsLng) : undefined,
    fieldValues,
  });

  redirect(`/inspections/${inspection.id}`);
}
