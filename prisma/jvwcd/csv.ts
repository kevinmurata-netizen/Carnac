import { readFileSync } from "node:fs";
import { join } from "node:path";
import { splitCsvLine } from "@/server/import";

/** Where the District's published tables live. */
export const SEED_DATA_DIR = join(process.cwd(), "prisma", "seed-data", "jvwcd");

export type CsvRow = Record<string, string>;

/**
 * One of JVWCD's CSVs as rows keyed by column name.
 *
 * Uses the same splitter the application's own import does, so a quoted
 * address with a comma in it — "11574 S. Wyndcastle (SERWTP)" — is read the
 * same way here as it would be if someone uploaded the file.
 */
export function readCsv(fileName: string): CsvRow[] {
  const text = readFileSync(join(SEED_DATA_DIR, fileName), "utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

/** A number, or null where the District published nothing. Blank is absent;
 * zero is a figure and is kept — several wells really did produce nothing. */
export function num(value: string | undefined): number | null {
  if (value == null) return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Text, or null where the cell is empty. */
export function text(value: string | undefined): string | null {
  const t = (value ?? "").trim();
  return t === "" ? null : t;
}

/** A year as a date, for the fields the model reads as an age. Jan 1 of the
 * published year: the sources give a year and nothing finer, and inventing a
 * month would be a precision the District did not claim. */
export function yearAsDate(value: string | undefined): Date | null {
  const year = num(value);
  if (year == null || year < 1800 || year > 2200) return null;
  return new Date(Date.UTC(year, 0, 1));
}
