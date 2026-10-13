import { prisma } from "@/lib/prisma";
import { AssetStatus, type AttributeDataType } from "@prisma/client";
import { insertAssetLocation } from "@/server/geo";
import { wholeAssetConditionModel } from "@/server/components";
import { parseMeasureCodes } from "@/server/measures";

/**
 * CSV import of an asset type's inventory (SPEC §27). Validation is a
 * separate, side-effect-free pass so the user always sees the complete error
 * report BEFORE anything is written — a partially-imported file is worse than
 * a rejected one.
 *
 * The columns are the chosen asset type's own: a few every asset has (its ID,
 * when it was installed, where it is), then one per attribute of the type,
 * required where the attribute is and checked against its data type. A
 * reservoir imports capacity and overflow elevation; a waterline, material,
 * diameter and length — and no code names either.
 */

/** Typical expected life when a row gives none — the same default the app
 * uses wherever an asset's own is missing. */
const DEFAULT_EXPECTED_LIFE = 75;

export type ImportColumnKind = "text" | "number" | "integer" | "date" | "boolean" | "enum";

export type ImportColumn = {
  key: string;
  label: string;
  required: boolean;
  kind: ImportColumnKind;
  /** A list attribute's allowed values. */
  options?: string[];
  /** What the column means and accepts, for the Expected Columns table. */
  note: string;
  /** Headers accepted besides the label: an attribute's code. */
  aliases: string[];
  /** The attribute it fills, for attribute columns. */
  attributeCode?: string;
  min?: number;
  max?: number;
};

export type ImportSpec = {
  assetTypeId: string;
  assetTypeName: string;
  columns: ImportColumn[];
};

export type RowError = { row: number; column: string; message: string };

/** One attribute value as it will be written. Kept as plain values so the
 * report can travel to the browser and back. */
type ParsedValue = {
  code: string;
  textValue?: string;
  numberValue?: number;
  dateValue?: string;
  booleanValue?: boolean;
};

export type ParsedRow = {
  rowNumber: number;
  assetCode: string;
  installationYear: number;
  latitude: number;
  longitude: number;
  condition: number | null;
  serviceArea: string | null;
  department: string | null;
  expectedLife: number | null;
  values: ParsedValue[];
  /** What the preview table shows, in `previewColumns` order. */
  preview: string[];
};

export type ValidationReport = {
  assetTypeName: string;
  totalRows: number;
  validRows: ParsedRow[];
  errors: RowError[];
  /** Header labels found in the file that we do not recognise. */
  unknownColumns: string[];
  missingColumns: string[];
  previewColumns: string[];
};

const KIND_OF: Record<AttributeDataType, ImportColumnKind> = {
  TEXT: "text",
  NUMBER: "number",
  DATE: "date",
  BOOLEAN: "boolean",
  ENUM: "enum",
};

/**
 * The columns an import for this asset type takes. The type must be this
 * organization's; any of its types can be imported, modelled or not.
 */
export async function getImportSpec(organizationId: string, assetTypeId: string): Promise<ImportSpec> {
  const type = await prisma.assetType.findFirst({
    where: { id: assetTypeId, organizationId },
    include: { attributeDefinitions: { orderBy: { sortOrder: "asc" } } },
  });
  if (!type) throw new Error("Choose an asset type to import into");
  const conditionModel = await wholeAssetConditionModel(type.id);
  const currentYear = new Date().getFullYear();

  const columns: ImportColumn[] = [
    { key: "assetCode", label: "Asset ID", required: true, kind: "text", aliases: [], note: "Must be unique — checked against existing assets and the rest of the file." },
    { key: "installationYear", label: "Installation Year", required: true, kind: "integer", min: 1850, max: currentYear, aliases: [], note: `Whole year, 1850 to ${currentYear}.` },
    { key: "latitude", label: "Latitude", required: true, kind: "number", min: -90, max: 90, aliases: [], note: "Decimal degrees, -90 to 90." },
    { key: "longitude", label: "Longitude", required: true, kind: "number", min: -180, max: 180, aliases: [], note: "Decimal degrees, -180 to 180." },
  ];
  for (const d of type.attributeDefinitions) {
    const kind = KIND_OF[d.dataType];
    const options = kind === "enum" ? ((d.config as { options?: string[] } | null)?.options ?? []) : undefined;
    const unit = d.unit ? ` (${d.unit})` : "";
    columns.push({
      key: `attr:${d.code}`,
      label: d.label,
      required: d.isRequired,
      kind,
      options,
      attributeCode: d.code,
      aliases: [d.code],
      note:
        kind === "enum"
          ? `One of: ${options!.join(", ")}.`
          : kind === "number"
            ? `A number${unit}.`
            : kind === "date"
              ? "A date, as YYYY-MM-DD."
              : kind === "boolean"
                ? "Yes or no (also true/false, 1/0)."
                : "Free text.",
    });
  }
  if (conditionModel) {
    columns.push({
      key: "condition",
      label: "Condition",
      required: false,
      kind: "number",
      min: conditionModel.scaleMin,
      max: conditionModel.scaleMax,
      aliases: [],
      note: `Optional ${conditionModel.scaleMin}–${conditionModel.scaleMax} on ${conditionModel.name}; recorded as a manual condition measurement.`,
    });
  }
  columns.push(
    { key: "serviceArea", label: "Service Area", required: false, kind: "text", aliases: [], note: "Optional free text." },
    { key: "department", label: "Department", required: false, kind: "text", aliases: ["Responsible department"], note: "Optional: the department responsible for it." },
    { key: "expectedLife", label: "Expected Life", required: false, kind: "integer", min: 1, max: 500, aliases: [], note: `Optional, in years; ${DEFAULT_EXPECTED_LIFE} when left blank.` }
  );
  return { assetTypeId: type.id, assetTypeName: type.name, columns };
}

/** The header row a blank import file starts with. */
export function templateHeader(spec: ImportSpec): string {
  return spec.columns.map((c) => (/[",]/.test(c.label) ? `"${c.label.replace(/"/g, '""')}"` : c.label)).join(",");
}

/** Minimal RFC4180-aware splitter — handles quoted fields containing commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((s) => s.trim());
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const TRUE_WORDS = new Set(["yes", "y", "true", "t", "1"]);
const FALSE_WORDS = new Set(["no", "n", "false", "f", "0"]);

export async function validateImport(organizationId: string, assetTypeId: string, csv: string): Promise<ValidationReport> {
  const spec = await getImportSpec(organizationId, assetTypeId);
  const errors: RowError[] = [];
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const attributeColumns = spec.columns.filter((c) => c.attributeCode);
  const previewColumns = ["Asset ID", "Installed", ...attributeColumns.slice(0, 4).map((c) => c.label), "Service Area"];
  const empty = { assetTypeName: spec.assetTypeName, previewColumns };

  if (lines.length === 0) {
    return { ...empty, totalRows: 0, validRows: [], errors: [{ row: 0, column: "-", message: "File is empty." }], unknownColumns: [], missingColumns: [] };
  }

  const rawHeaders = splitCsvLine(lines[0]);
  const headerCells = rawHeaders.map(normalizeHeader);
  const indexOf = (column: ImportColumn) => {
    for (const name of [column.label, ...column.aliases]) {
      const i = headerCells.indexOf(normalizeHeader(name));
      if (i !== -1) return i;
    }
    return -1;
  };

  const missingColumns = spec.columns.filter((c) => c.required && indexOf(c) === -1).map((c) => c.label);
  const known = new Set(spec.columns.flatMap((c) => [c.label, ...c.aliases].map(normalizeHeader)));
  const unknownColumns = rawHeaders.filter((h) => !known.has(normalizeHeader(h)));

  if (missingColumns.length > 0) {
    return {
      ...empty,
      totalRows: lines.length - 1,
      validRows: [],
      errors: [{ row: 1, column: "header", message: `Missing required column(s) for ${spec.assetTypeName}: ${missingColumns.join(", ")}.` }],
      unknownColumns,
      missingColumns,
    };
  }

  const existing = await prisma.asset.findMany({
    where: { organizationId, deletedAt: null },
    select: { assetCode: true },
  });
  const existingCodes = new Set(existing.map((a) => a.assetCode.toLowerCase()));
  const seenInFile = new Set<string>();
  const validRows: ParsedRow[] = [];
  const column = (key: string) => spec.columns.find((c) => c.key === key);

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-based including header, matching a spreadsheet
    const cells = splitCsvLine(lines[i]);
    const rowErrors: RowError[] = [];
    const raw = (c: ImportColumn) => {
      const idx = indexOf(c);
      return idx >= 0 && idx < cells.length ? cells[idx] : "";
    };
    const fail = (c: ImportColumn, message: string) => {
      rowErrors.push({ row: rowNumber, column: c.label, message });
      return null;
    };

    /** The cell as its column's kind, null when blank (an error first if the
     * column is required) or invalid (with the error recorded). */
    const read = (c: ImportColumn): string | number | boolean | null => {
      const value = raw(c);
      if (value === "") return c.required ? fail(c, `${c.label} is required.`) : null;
      switch (c.kind) {
        case "text":
          return value;
        case "enum":
          return c.options!.includes(value)
            ? value
            : fail(c, `"${value}" is not valid. Expected one of: ${c.options!.join(", ")}.`);
        case "boolean": {
          const word = value.toLowerCase();
          if (TRUE_WORDS.has(word)) return true;
          if (FALSE_WORDS.has(word)) return false;
          return fail(c, `"${value}" isn't yes or no.`);
        }
        case "date": {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
            return fail(c, `"${value}" isn't a date written as YYYY-MM-DD.`);
          }
          return value;
        }
        default: {
          const n = Number(value);
          if (!Number.isFinite(n)) return fail(c, `"${value}" is not a number.`);
          if (c.kind === "integer" && !Number.isInteger(n)) return fail(c, `${c.label} must be a whole number.`);
          if (c.min != null && n < c.min) return fail(c, `${c.label} must be at least ${c.min}.`);
          if (c.max != null && n > c.max) return fail(c, `${c.label} must be at most ${c.max}.`);
          return n;
        }
      }
    };

    const idColumn = column("assetCode")!;
    const assetCode = read(idColumn) as string | null;
    if (assetCode && existingCodes.has(assetCode.toLowerCase())) {
      fail(idColumn, `Asset ID "${assetCode}" already exists.`);
    } else if (assetCode && seenInFile.has(assetCode.toLowerCase())) {
      fail(idColumn, `Asset ID "${assetCode}" is duplicated in this file.`);
    }
    const installationYear = read(column("installationYear")!) as number | null;
    const latitude = read(column("latitude")!) as number | null;
    const longitude = read(column("longitude")!) as number | null;
    const condition = column("condition") ? (read(column("condition")!) as number | null) : null;
    const serviceArea = read(column("serviceArea")!) as string | null;
    const department = read(column("department")!) as string | null;
    const expectedLife = read(column("expectedLife")!) as number | null;

    const values: ParsedValue[] = [];
    const shown = new Map<string, string>();
    for (const c of attributeColumns) {
      const v = read(c);
      if (v == null) continue;
      shown.set(c.label, typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));
      const code = c.attributeCode!;
      if (c.kind === "number") values.push({ code, numberValue: v as number });
      else if (c.kind === "boolean") values.push({ code, booleanValue: v as boolean });
      else if (c.kind === "date") values.push({ code, dateValue: v as string });
      else values.push({ code, textValue: v as string });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    seenInFile.add(assetCode!.toLowerCase());
    validRows.push({
      rowNumber,
      assetCode: assetCode!,
      installationYear: installationYear!,
      latitude: latitude!,
      longitude: longitude!,
      condition,
      serviceArea,
      department,
      expectedLife,
      values,
      preview: [
        assetCode!,
        String(installationYear),
        ...attributeColumns.slice(0, 4).map((c) => shown.get(c.label) ?? "—"),
        serviceArea ?? "—",
      ],
    });
  }

  return { ...empty, totalRows: lines.length - 1, validRows, errors, unknownColumns, missingColumns };
}

export type ImportResult = { imported: number; skipped: number; assetTypeName: string };

/** Commit validated rows. Re-validates first: the file could have been edited,
 * or another import could have claimed an asset code, between preview and
 * commit. */
export async function commitImport(organizationId: string, assetTypeId: string, csv: string): Promise<ImportResult> {
  const report = await validateImport(organizationId, assetTypeId, csv);
  if (report.validRows.length === 0) {
    return { imported: 0, skipped: report.totalRows, assetTypeName: report.assetTypeName };
  }

  const assetType = await prisma.assetType.findFirstOrThrow({
    where: { id: assetTypeId, organizationId },
    select: { id: true, geometry: true, measures: true, attributeDefinitions: { select: { id: true, code: true } } },
  });
  const defByCode = new Map(assetType.attributeDefinitions.map((d) => [d.code, d.id]));
  const lengthCode = parseMeasureCodes(assetType.measures).length;
  const conditionModel = await wholeAssetConditionModel(assetType.id);

  for (const row of report.validRows) {
    const attributeValues = row.values.flatMap((v) => {
      const definitionId = defByCode.get(v.code);
      if (!definitionId) return [];
      return [
        {
          definitionId,
          textValue: v.textValue,
          numberValue: v.numberValue,
          dateValue: v.dateValue ? new Date(`${v.dateValue}T00:00:00Z`) : undefined,
          booleanValue: v.booleanValue,
        },
      ];
    });

    const asset = await prisma.asset.create({
      data: {
        organizationId,
        assetTypeId: assetType.id,
        assetCode: row.assetCode,
        status: AssetStatus.ACTIVE,
        ownerDepartment: row.department,
        installationDate: new Date(Date.UTC(row.installationYear, 0, 1)),
        expectedUsefulLife: row.expectedLife ?? DEFAULT_EXPECTED_LIFE,
        attributeValues: { create: attributeValues },
      },
    });

    // Imported rows give a single position, drawn as the type is: a point,
    // or a short line as long as the asset where its type measures length.
    const length = (lengthCode && row.values.find((v) => v.code === lengthCode)?.numberValue) || null;
    await insertAssetLocation(
      asset.id,
      assetType.geometry,
      { lat: row.latitude, lng: row.longitude },
      length,
      { serviceArea: row.serviceArea }
    );

    if (row.condition != null && conditionModel) {
      await prisma.conditionMeasurement.create({
        data: {
          assetId: asset.id,
          conditionModelId: conditionModel.id,
          score: row.condition,
          measurementDate: new Date(),
          source: "Manual Override",
        },
      });
    }
  }

  return {
    imported: report.validRows.length,
    skipped: report.totalRows - report.validRows.length,
    assetTypeName: report.assetTypeName,
  };
}
