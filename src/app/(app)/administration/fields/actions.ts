"use server";

import { revalidatePath } from "next/cache";
import { AttributeDataType } from "@prisma/client";
import { requireCardWrite } from "@/server/guard";
import {
  updateInspectionField,
  createInspectionField,
  deleteInspectionField,
  updateInventoryField,
  createInventoryField,
  deleteInventoryField,
} from "@/server/field-config";
import type { FieldActionState } from "./state";

async function requireWriteAccess() {
  return requireCardWrite("/administration/fields", "Only an Administrator can change field definitions");
}

function revalidateAffected() {
  for (const path of ["/administration/fields", "/administration", "/inspections/new", "/assets"]) {
    revalidatePath(path);
  }
}

function parseDataType(raw: unknown): AttributeDataType {
  const value = String(raw ?? "");
  if ((Object.values(AttributeDataType) as string[]).includes(value)) return value as AttributeDataType;
  throw new Error(`"${value}" is not a valid data type`);
}

function parseOptions(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ok(message: string): FieldActionState {
  return { status: "success", message };
}
function fail(err: unknown, fallback: string): FieldActionState {
  return { status: "error", message: err instanceof Error ? err.message : fallback };
}

// --- Inspection fields ------------------------------------------------------

export async function saveInspectionFieldAction(
  _prev: FieldActionState,
  formData: FormData
): Promise<FieldActionState> {
  try {
    const session = await requireWriteAccess();
    await updateInspectionField(session.user.organizationId, String(formData.get("fieldId") ?? ""), {
      label: String(formData.get("label") ?? ""),
      unit: String(formData.get("unit") ?? "") || null,
      isRequired: formData.get("isRequired") === "on",
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      helpText: String(formData.get("helpText") ?? "") || null,
    });
    revalidateAffected();
    return ok("Inspection field updated.");
  } catch (err) {
    return fail(err, "Could not update inspection field");
  }
}

export async function createInspectionFieldAction(
  _prev: FieldActionState,
  formData: FormData
): Promise<FieldActionState> {
  try {
    const session = await requireWriteAccess();
    await createInspectionField(session.user.organizationId, {
      code: String(formData.get("code") ?? ""),
      label: String(formData.get("label") ?? ""),
      dataType: parseDataType(formData.get("dataType")),
      unit: String(formData.get("unit") ?? ""),
      isRequired: formData.get("isRequired") === "on",
      helpText: String(formData.get("helpText") ?? ""),
    });
    revalidateAffected();
    return ok("Inspection field created. Add it to the Condition Index if it should affect the score.");
  } catch (err) {
    return fail(err, "Could not create inspection field");
  }
}

export async function deleteInspectionFieldAction(
  _prev: FieldActionState,
  formData: FormData
): Promise<FieldActionState> {
  try {
    const session = await requireWriteAccess();
    await deleteInspectionField(session.user.organizationId, String(formData.get("fieldId") ?? ""));
    revalidateAffected();
    return ok("Inspection field deleted.");
  } catch (err) {
    return fail(err, "Could not delete inspection field");
  }
}

// --- Inventory fields -------------------------------------------------------

export async function saveInventoryFieldAction(
  _prev: FieldActionState,
  formData: FormData
): Promise<FieldActionState> {
  try {
    const session = await requireWriteAccess();
    await updateInventoryField(session.user.organizationId, String(formData.get("definitionId") ?? ""), {
      label: String(formData.get("label") ?? ""),
      unit: String(formData.get("unit") ?? "") || null,
      isRequired: formData.get("isRequired") === "on",
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      options: parseOptions(formData.get("options")),
    });
    revalidateAffected();
    return ok("Inventory field updated.");
  } catch (err) {
    return fail(err, "Could not update inventory field");
  }
}

export async function createInventoryFieldAction(
  _prev: FieldActionState,
  formData: FormData
): Promise<FieldActionState> {
  try {
    const session = await requireWriteAccess();
    await createInventoryField(session.user.organizationId, {
      code: String(formData.get("code") ?? ""),
      label: String(formData.get("label") ?? ""),
      dataType: parseDataType(formData.get("dataType")),
      unit: String(formData.get("unit") ?? ""),
      isRequired: formData.get("isRequired") === "on",
      options: parseOptions(formData.get("options")),
    });
    revalidateAffected();
    return ok("Inventory field created.");
  } catch (err) {
    return fail(err, "Could not create inventory field");
  }
}

export async function deleteInventoryFieldAction(
  _prev: FieldActionState,
  formData: FormData
): Promise<FieldActionState> {
  try {
    const session = await requireWriteAccess();
    await deleteInventoryField(session.user.organizationId, String(formData.get("definitionId") ?? ""));
    revalidateAffected();
    return ok("Inventory field deleted.");
  } catch (err) {
    return fail(err, "Could not delete inventory field");
  }
}
