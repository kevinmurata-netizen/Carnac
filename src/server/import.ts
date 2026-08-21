import { prisma } from "@/lib/prisma";
import { AssetStatus } from "@prisma/client";
import {
  WATERLINE_ATTRIBUTES,
  MATERIAL_OPTIONS,
  CRITICALITY_OPTIONS,
} from "@/domain/waterline/attributes";
import { insertAssetLineLocation } from "@/server/geo";

/**
 * CSV import for waterline inventory (SPEC §27). Validation is a separate,
 * side-effect-free pass so the user always sees the complete error report
 * BEFORE anything is written — a partially-imported file is worse than a
 * rejected one.
 */

export const IMPORT_COLUMNS = [
  { key: "assetCode", label: "Asset ID", required: true },
  { key: "material", label: "Material", required: true },
  { key: "diameter", label: "Diameter", required: true },
  { key: "installationYear", label: "Installation Year", required: true },
  { key: "length", label: "Length", required: true },
  { key: "latitude", label: "Latitude", required: true },
  { key: "longitude", label: "Longitude", required: true },
  { key: "condition", label: "Condition", required: false },
  { key: "criticality", label: "Criticality", required: false },
  { key: "customersServed", label: "Customers Served", required: false },
  { key: "serviceArea", label: "Service Area", required: false },
] as const;

export const IMPORT_TEMPLATE_HEADER = IMPORT_COLUMNS.map((c) => c.label).join(",");

export const IMPORT_SAMPLE_ROWS = [
  "WL-9001,Ductile Iron,8,1998,1450,39.5205,-98.3512,72,Moderate,120,Downtown",
  "WL-9002,PVC,12,2011,980,39.5064,-98.3702,88,Low,64,Riverside",
];

export type RowError = { row: number; column: string; message: string };

export type ParsedRow = {
  rowNumber: number;
  assetCode: string;
  material: string;
  diameter: number;
  installationYear: number;
  length: number;
  latitude: number;
  longitude: number;
  condition: number | null;
  criticality: string | null;
  customersServed: number | null;
  serviceArea: string | null;
};

export type ValidationReport = {
  totalRows: number;
  validRows: ParsedRow[];
  errors: RowError[];
  /** Header labels found in the file that we do not recognise. */
  unknownColumns: string[];
  missingColumns: string[];
};

/** Minimal RFC4180-aware splitter — handles quoted fields containing commas. */
function splitCsvLine(line: string): string[] {
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

export async function validateImport(organizationId: string, csv: string): Promise<ValidationReport> {
  const errors: RowError[] = [];
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { totalRows: 0, validRows: [], errors: [{ row: 0, column: "-", message: "File is empty." }], unknownColumns: [], missingColumns: [] };
  }

  const headerCells = splitCsvLine(lines[0]).map(normalizeHeader);
  const indexOf = (key: string) => {
    const col = IMPORT_COLUMNS.find((c) => c.key === key)!;
    return headerCells.indexOf(normalizeHeader(col.label));
  };

  const missingColumns = IMPORT_COLUMNS.filter((c) => c.required && indexOf(c.key) === -1).map((c) => c.label);
  const knownHeaders = IMPORT_COLUMNS.map((c) => normalizeHeader(c.label));
  const unknownColumns = splitCsvLine(lines[0]).filter((h) => !knownHeaders.includes(normalizeHeader(h)));

  if (missingColumns.length > 0) {
    return {
      totalRows: lines.length - 1,
      validRows: [],
      errors: [
        { row: 1, column: "header", message: `Missing required column(s): ${missingColumns.join(", ")}.` },
      ],
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
  const currentYear = new Date().getFullYear();

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1; // 1-based including header, matching a spreadsheet
    const cells = splitCsvLine(lines[i]);
    const get = (key: string) => {
      const idx = indexOf(key);
      return idx >= 0 && idx < cells.length ? cells[idx] : "";
    };
    const rowErrors: RowError[] = [];

    const assetCode = get("assetCode");
    if (!assetCode) {
      rowErrors.push({ row: rowNumber, column: "Asset ID", message: "Asset ID is required." });
    } else if (existingCodes.has(assetCode.toLowerCase())) {
      rowErrors.push({ row: rowNumber, column: "Asset ID", message: `Asset ID "${assetCode}" already exists.` });
    } else if (seenInFile.has(assetCode.toLowerCase())) {
      rowErrors.push({ row: rowNumber, column: "Asset ID", message: `Asset ID "${assetCode}" is duplicated in this file.` });
    }

    const material = get("material");
    if (!material) {
      rowErrors.push({ row: rowNumber, column: "Material", message: "Material is required." });
    } else if (!(MATERIAL_OPTIONS as readonly string[]).includes(material)) {
      rowErrors.push({
        row: rowNumber,
        column: "Material",
        message: `"${material}" is not a known material. Expected one of: ${MATERIAL_OPTIONS.join(", ")}.`,
      });
    }

    const numeric = (key: string, label: string, opts: { min?: number; max?: number; integer?: boolean }) => {
      const raw = get(key);
      if (raw === "") {
        rowErrors.push({ row: rowNumber, column: label, message: `${label} is required.` });
        return null;
      }
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        rowErrors.push({ row: rowNumber, column: label, message: `"${raw}" is not a number.` });
        return null;
      }
      if (opts.integer && !Number.isInteger(n)) {
        rowErrors.push({ row: rowNumber, column: label, message: `${label} must be a whole number.` });
        return null;
      }
      if (opts.min != null && n < opts.min) {
        rowErrors.push({ row: rowNumber, column: label, message: `${label} must be at least ${opts.min}.` });
        return null;
      }
      if (opts.max != null && n > opts.max) {
        rowErrors.push({ row: rowNumber, column: label, message: `${label} must be at most ${opts.max}.` });
        return null;
      }
      return n;
    };

    const diameter = numeric("diameter", "Diameter", { min: 1, max: 120 });
    const installationYear = numeric("installationYear", "Installation Year", {
      min: 1850,
      max: currentYear,
      integer: true,
    });
    const length = numeric("length", "Length", { min: 1, max: 100000 });
    const latitude = numeric("latitude", "Latitude", { min: -90, max: 90 });
    const longitude = numeric("longitude", "Longitude", { min: -180, max: 180 });

    let condition: number | null = null;
    if (get("condition") !== "") {
      condition = numeric("condition", "Condition", { min: 0, max: 100 });
    }

    let customersServed: number | null = null;
    if (get("customersServed") !== "") {
      customersServed = numeric("customersServed", "Customers Served", { min: 0, integer: true });
    }

    const criticality = get("criticality") || null;
    if (criticality && !(CRITICALITY_OPTIONS as readonly string[]).includes(criticality)) {
      rowErrors.push({
        row: rowNumber,
        column: "Criticality",
        message: `"${criticality}" is not valid. Expected one of: ${CRITICALITY_OPTIONS.join(", ")}.`,
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    if (assetCode) seenInFile.add(assetCode.toLowerCase());
    validRows.push({
      rowNumber,
      assetCode,
      material,
      diameter: diameter!,
      installationYear: installationYear!,
      length: length!,
      latitude: latitude!,
      longitude: longitude!,
      condition,
      criticality,
      customersServed,
      serviceArea: get("serviceArea") || null,
    });
  }

  return { totalRows: lines.length - 1, validRows, errors, unknownColumns, missingColumns };
}

export type ImportResult = { imported: number; skipped: number };

/** Commit validated rows. Re-validates first: the file could have been edited,
 * or another import could have claimed an asset code, between preview and
 * commit. */
export async function commitImport(organizationId: string, csv: string): Promise<ImportResult> {
  const report = await validateImport(organizationId, csv);
  if (report.validRows.length === 0) return { imported: 0, skipped: report.totalRows };

  const assetType = await prisma.assetType.findFirst({ where: { code: "WATERLINE", organizationId } });
  if (!assetType) throw new Error("WATERLINE asset type is not configured");

  const definitions = await prisma.assetAttributeDefinition.findMany({
    where: { assetTypeId: assetType.id },
    select: { id: true, code: true },
  });
  const defByCode = new Map(definitions.map((d) => [d.code, d.id]));

  const conditionModel = await prisma.conditionModel.findFirst({ where: { assetTypeId: assetType.id } });

  for (const row of report.validRows) {
    const attributeValues = [
      { code: WATERLINE_ATTRIBUTES.MATERIAL, textValue: row.material },
      { code: WATERLINE_ATTRIBUTES.DIAMETER, numberValue: row.diameter },
      { code: WATERLINE_ATTRIBUTES.LENGTH, numberValue: row.length },
      ...(row.criticality ? [{ code: WATERLINE_ATTRIBUTES.CRITICALITY, textValue: row.criticality }] : []),
      ...(row.customersServed != null
        ? [{ code: WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED, numberValue: row.customersServed }]
        : []),
    ].flatMap((v) => {
      const definitionId = defByCode.get(v.code);
      if (!definitionId) return [];
      return [{ definitionId, textValue: "textValue" in v ? v.textValue : undefined, numberValue: "numberValue" in v ? v.numberValue : undefined }];
    });

    const asset = await prisma.asset.create({
      data: {
        organizationId,
        assetTypeId: assetType.id,
        assetCode: row.assetCode,
        status: AssetStatus.ACTIVE,
        ownerDepartment: "Water Distribution",
        installationDate: new Date(Date.UTC(row.installationYear, 0, 1)),
        expectedUsefulLife: 75,
        attributeValues: { create: attributeValues },
      },
    });

    // Imported rows give a single point; represent it as a minimal line so the
    // geometry column stays consistent with the rest of the network.
    const delta = row.length / 2 / 364_000;
    await insertAssetLineLocation(
      asset.id,
      {
        startLat: row.latitude - delta,
        startLng: row.longitude,
        endLat: row.latitude + delta,
        endLng: row.longitude,
      },
      { serviceArea: row.serviceArea, pressureZone: null, depth: null }
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

  return { imported: report.validRows.length, skipped: report.totalRows - report.validRows.length };
}
