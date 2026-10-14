import { prisma } from "@/lib/prisma";
import { INSPECTION_TYPES } from "@/domain/waterline/inspection";
import { createInspection } from "@/server/inspections";
import { normalizeHeader, parseCell, splitCsvLine, type ImportColumn, type RowError } from "@/server/import";

/**
 * Inspection history from CSV, for one asset type: one row per inspection,
 * a column per question on the type's inspection form.
 *
 * Each row becomes the same inspection the New Inspection form would make —
 * scored against the type's condition index, which files a condition
 * measurement — so an imported history drives condition, risk and forecasts
 * exactly as one typed in. Every row is checked before anything is written.
 */

export type InspectionImportSpec = {
  assetTypeId: string;
  assetTypeName: string;
  /** The form the rows are filed against; null when the type has none. */
  templateName: string | null;
  columns: ImportColumn[];
};

/** One inspection as it will be written, kept as plain values so the report
 * can travel to the browser and back. */
export type ParsedInspection = {
  rowNumber: number;
  assetId: string;
  assetCode: string;
  inspectionDate: string;
  inspectionType: string;
  inspectorId: string;
  requiresFollowUp: boolean;
  notes: string | null;
  answers: Array<{ fieldId: string; code: string; dataType: string; value: string }>;
  preview: string[];
};

export type InspectionImportReport = {
  assetTypeName: string;
  totalRows: number;
  validRows: ParsedInspection[];
  errors: RowError[];
  unknownColumns: string[];
  missingColumns: string[];
  previewColumns: string[];
};

/** The active form a type's whole-asset inspections are recorded on. */
async function formFor(assetTypeId: string) {
  return prisma.inspectionTemplate.findFirst({
    where: { assetTypeId, isActive: true, componentTypeId: null },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
}

const KIND = { NUMBER: "number", TEXT: "text", DATE: "date", BOOLEAN: "boolean", ENUM: "enum" } as const;

export async function getInspectionImportSpec(organizationId: string, assetTypeId: string): Promise<InspectionImportSpec> {
  const type = await prisma.assetType.findFirst({
    where: { id: assetTypeId, organizationId },
    select: { id: true, name: true },
  });
  if (!type) throw new Error("Asset type not found");
  const form = await formFor(type.id);

  const columns: ImportColumn[] = [
    { key: "assetCode", label: "Asset ID", required: true, kind: "text", aliases: [], note: `An existing ${type.name.toLowerCase()}'s ID.` },
    { key: "inspectionDate", label: "Inspection Date", required: true, kind: "date", aliases: ["Date"], note: "YYYY-MM-DD, not in the future." },
    {
      key: "inspectionType",
      label: "Inspection Type",
      required: false,
      kind: "enum",
      options: [...INSPECTION_TYPES],
      aliases: ["Type"],
      note: `One of: ${INSPECTION_TYPES.join(", ")}. Routine when left blank.`,
    },
    { key: "inspector", label: "Inspector", required: false, kind: "text", aliases: [], note: "A user's email or name. You, when left blank." },
    { key: "followUp", label: "Follow-up", required: false, kind: "boolean", aliases: ["Requires follow-up"], note: "Yes or No. No when left blank." },
    { key: "notes", label: "Notes", required: false, kind: "text", aliases: [], note: "Optional free text." },
    ...(form?.fields ?? []).map((f): ImportColumn => {
      const options = (f.config as { options?: string[] } | null)?.options ?? [];
      const help = (f.config as { helpText?: string } | null)?.helpText;
      const numeric = f.dataType === "NUMBER";
      return {
        key: `field:${f.id}`,
        label: f.label,
        required: f.isRequired,
        kind: KIND[f.dataType],
        options: f.dataType === "ENUM" ? options : undefined,
        aliases: [f.code],
        attributeCode: f.code,
        ...(numeric ? { min: 0, max: 10 } : {}),
        note: [numeric ? "A score from 0 to 10." : f.dataType === "ENUM" ? `One of: ${options.join(", ")}.` : null, help ?? null]
          .filter(Boolean)
          .join(" ") || "Optional.",
      };
    }),
  ];
  return { assetTypeId: type.id, assetTypeName: type.name, templateName: form?.name ?? null, columns };
}

export function inspectionTemplateHeader(spec: InspectionImportSpec): string {
  return spec.columns.map((c) => (/[",]/.test(c.label) ? `"${c.label.replace(/"/g, '""')}"` : c.label)).join(",");
}

export async function validateInspectionImport(
  organizationId: string,
  assetTypeId: string,
  importerId: string,
  csv: string
): Promise<InspectionImportReport> {
  const spec = await getInspectionImportSpec(organizationId, assetTypeId);
  const questionColumns = spec.columns.filter((c) => c.key.startsWith("field:"));
  const previewColumns = ["Asset ID", "Date", "Type", "Inspector", ...questionColumns.slice(0, 4).map((c) => c.label)];
  const empty = { assetTypeName: spec.assetTypeName, previewColumns, unknownColumns: [], missingColumns: [], validRows: [] };

  if (!spec.templateName) {
    return { ...empty, totalRows: 0, errors: [{ row: 0, column: "-", message: `${spec.assetTypeName} has no active inspection form to file these against. Add one under Settings › Inspection Templates.` }] };
  }
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { ...empty, totalRows: 0, errors: [{ row: 0, column: "-", message: "File is empty." }] };

  const rawHeaders = splitCsvLine(lines[0]);
  const headerCells = rawHeaders.map(normalizeHeader);
  const indexOf = (c: ImportColumn) => {
    for (const name of [c.label, ...c.aliases]) {
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
      unknownColumns,
      missingColumns,
      errors: [{ row: 1, column: "header", message: `Missing required column(s): ${missingColumns.join(", ")}.` }],
    };
  }

  const [assets, users] = await Promise.all([
    prisma.asset.findMany({ where: { organizationId, assetTypeId: spec.assetTypeId, deletedAt: null }, select: { id: true, assetCode: true } }),
    prisma.user.findMany({ where: { organizationId }, select: { id: true, email: true, name: true } }),
  ]);
  const assetByCode = new Map(assets.map((a) => [a.assetCode.toLowerCase(), a]));
  const userFor = (text: string) =>
    users.find((u) => u.email.toLowerCase() === text.toLowerCase()) ??
    users.filter((u) => (u.name ?? "").toLowerCase() === text.toLowerCase()).at(0);
  const today = new Date().toISOString().slice(0, 10);
  const column = (key: string) => spec.columns.find((c) => c.key === key)!;

  const errors: RowError[] = [];
  const validRows: ParsedInspection[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cells = splitCsvLine(lines[i]);
    const rowErrors: RowError[] = [];
    const fail = (c: ImportColumn, message: string) => {
      rowErrors.push({ row: rowNumber, column: c.label, message });
      return null;
    };
    const read = (c: ImportColumn): string | number | boolean | null => {
      const idx = indexOf(c);
      const value = idx >= 0 && idx < cells.length ? cells[idx] : "";
      if (value === "") return c.required ? fail(c, `${c.label} is required.`) : null;
      const parsed = parseCell(c, value);
      return "error" in parsed ? fail(c, parsed.error) : parsed.value;
    };

    const code = read(column("assetCode")) as string | null;
    const asset = code ? assetByCode.get(code.toLowerCase()) : undefined;
    if (code && !asset) fail(column("assetCode"), `No ${spec.assetTypeName.toLowerCase()} "${code}".`);
    const date = read(column("inspectionDate")) as string | null;
    if (date && date > today) fail(column("inspectionDate"), `${date} is in the future.`);
    const type = (read(column("inspectionType")) as string | null) ?? "Routine";
    const inspectorText = read(column("inspector")) as string | null;
    const inspector = inspectorText ? userFor(inspectorText) : users.find((u) => u.id === importerId);
    if (inspectorText && !inspector) fail(column("inspector"), `No user "${inspectorText}" — use their email or name.`);
    const followUp = (read(column("followUp")) as boolean | null) ?? false;
    const notes = read(column("notes")) as string | null;

    const answers: ParsedInspection["answers"] = [];
    for (const c of questionColumns) {
      const v = read(c);
      if (v == null) continue;
      const field = c.key.slice("field:".length);
      const dataType = c.kind === "number" ? "NUMBER" : c.kind === "boolean" ? "BOOLEAN" : c.kind === "date" ? "DATE" : c.kind === "enum" ? "ENUM" : "TEXT";
      answers.push({ fieldId: field, code: c.attributeCode!, dataType, value: typeof v === "boolean" ? (v ? "Yes" : "No") : String(v) });
    }

    if (rowErrors.length > 0 || !asset || !date || !inspector) {
      errors.push(...rowErrors);
      continue;
    }
    validRows.push({
      rowNumber,
      assetId: asset.id,
      assetCode: asset.assetCode,
      inspectionDate: date,
      inspectionType: type,
      inspectorId: inspector.id,
      requiresFollowUp: followUp,
      notes,
      answers,
      preview: [
        asset.assetCode,
        date,
        type,
        inspector.name ?? inspector.email,
        ...questionColumns.slice(0, 4).map((c) => answers.find((a) => a.fieldId === c.key.slice("field:".length))?.value ?? "—"),
      ],
    });
  }

  return { assetTypeName: spec.assetTypeName, totalRows: lines.length - 1, validRows, errors, unknownColumns, missingColumns, previewColumns };
}

/**
 * Writes every row as an inspection, oldest first, so an asset's latest
 * condition is its most recent inspection's. Refuses the whole file while
 * any row has an error.
 */
export async function commitInspectionImport(
  organizationId: string,
  assetTypeId: string,
  importerId: string,
  csv: string
): Promise<{ imported: number; assetTypeName: string }> {
  const report = await validateInspectionImport(organizationId, assetTypeId, importerId, csv);
  if (report.errors.length > 0) throw new Error("Fix the errors in the file and validate again");
  const form = await formFor(assetTypeId);
  if (!form) throw new Error(`${report.assetTypeName} has no active inspection form`);

  const rows = [...report.validRows].sort((a, b) => a.inspectionDate.localeCompare(b.inspectionDate));
  for (const row of rows) {
    await createInspection(organizationId, {
      assetId: row.assetId,
      templateId: form.id,
      inspectorId: row.inspectorId,
      inspectionDate: new Date(row.inspectionDate),
      inspectionType: row.inspectionType,
      requiresFollowUp: row.requiresFollowUp,
      notes: row.notes ?? undefined,
      fieldValues: row.answers,
    });
  }
  return { imported: rows.length, assetTypeName: report.assetTypeName };
}
