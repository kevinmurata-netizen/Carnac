"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { validateImport, commitImport } from "@/server/import";
import { validateInspectionImport, commitInspectionImport } from "@/server/inspection-import";
import { EMPTY_IMPORT_STATE, type ImportState } from "./state";

async function requireEditor() {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) {
    throw new Error("You do not have permission to import data");
  }
  return session;
}

export async function validateImportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  try {
    const session = await requireEditor();
    const csv = String(formData.get("csv") ?? "").trim();
    const assetTypeId = String(formData.get("assetTypeId") ?? "");
    if (!csv) {
      return { ...EMPTY_IMPORT_STATE, phase: "error", message: "Paste CSV content or upload a file first." };
    }
    const report =
      formData.get("kind") === "inspections"
        ? await validateInspectionImport(session.user.organizationId, assetTypeId, session.user.id!, csv)
        : await validateImport(session.user.organizationId, assetTypeId, csv);
    return {
      phase: "validated",
      csv,
      report,
      imported: 0,
      message: null,
    };
  } catch (err) {
    return { ...EMPTY_IMPORT_STATE, phase: "error", message: err instanceof Error ? err.message : "Validation failed" };
  }
}

export async function commitImportAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  try {
    const session = await requireEditor();
    const csv = String(formData.get("csv") ?? "").trim();
    const assetTypeId = String(formData.get("assetTypeId") ?? "");
    if (!csv) {
      return { ...EMPTY_IMPORT_STATE, phase: "error", message: "Nothing to import." };
    }
    const inspections = formData.get("kind") === "inspections";

    const report = inspections
      ? await validateInspectionImport(session.user.organizationId, assetTypeId, session.user.id!, csv)
      : await validateImport(session.user.organizationId, assetTypeId, csv);
    if (report.errors.length > 0) {
      return {
        phase: "validated",
        csv,
        report,
        imported: 0,
        message: "Import blocked — fix the errors below and validate again.",
      };
    }

    if (inspections) {
      const result = await commitInspectionImport(session.user.organizationId, assetTypeId, session.user.id!, csv);
      // Each inspection files a condition score, which every condition and
      // asset view reads.
      for (const path of ["/inspections", "/condition", "/assets", "/dashboard", "/deterioration-models"]) revalidatePath(path);
      return {
        phase: "committed",
        csv: "",
        report: null,
        imported: result.imported,
        message: `Imported ${result.imported} ${result.assetTypeName.toLowerCase()} inspection${result.imported === 1 ? "" : "s"}, each scored by its condition index. Recompute risk under Settings › Risk Models to bring risk scores in line.`,
      };
    }

    const result = await commitImport(session.user.organizationId, assetTypeId, csv);
    revalidatePath("/assets");
    revalidatePath("/network");
    revalidatePath("/dashboard");

    return {
      phase: "committed",
      csv: "",
      report: null,
      imported: result.imported,
      message: `Imported ${result.imported} ${result.assetTypeName.toLowerCase()} asset${result.imported === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    return { ...EMPTY_IMPORT_STATE, phase: "error", message: err instanceof Error ? err.message : "Import failed" };
  }
}
