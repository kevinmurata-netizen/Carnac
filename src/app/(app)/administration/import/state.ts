import type { RowError } from "@/server/import";

/**
 * Shared between the server action and the client form. This lives outside
 * actions.ts because a "use server" module may only export async functions —
 * exporting a plain object from it fails at module evaluation, not at build.
 */
/** What the form shows of a validation, whichever kind of file it was: the
 * asset and inspection reports both have this shape. */
export type ImportReportView = {
  totalRows: number;
  validRows: Array<{ rowNumber: number; preview: string[] }>;
  errors: RowError[];
  unknownColumns: string[];
  previewColumns: string[];
};

/** What a file holds: new assets, or inspections of existing ones. */
export type ImportKind = "assets" | "inspections";

export type ImportState = {
  phase: "idle" | "validated" | "committed" | "error";
  csv: string;
  report: ImportReportView | null;
  imported: number;
  message: string | null;
};

export const EMPTY_IMPORT_STATE: ImportState = {
  phase: "idle",
  csv: "",
  report: null,
  imported: 0,
  message: null,
};
