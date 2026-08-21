import type { ValidationReport } from "@/server/import";

/**
 * Shared between the server action and the client form. This lives outside
 * actions.ts because a "use server" module may only export async functions —
 * exporting a plain object from it fails at module evaluation, not at build.
 */
export type ImportState = {
  phase: "idle" | "validated" | "committed" | "error";
  csv: string;
  report: ValidationReport | null;
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
