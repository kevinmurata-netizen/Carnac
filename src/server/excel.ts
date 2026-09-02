import ExcelJS from "exceljs";

/**
 * Turns a grid into a real .xlsx workbook.
 *
 * Not a CSV with a different extension: numbers arrive as numbers and dates as
 * dates, so a column of diameters sorts and sums in Excel instead of ordering
 * 10 before 8. That is the whole reason someone asks for an Excel export
 * rather than the CSV that already exists.
 */

export type ExcelColumn = {
  key: string;
  header: string;
  /** Drives the cell type and number format. */
  type?: "text" | "number" | "integer" | "money" | "date";
  width?: number;
};

export type ExcelRow = Record<string, string | number | Date | null | undefined>;

const FORMATS: Record<string, string | undefined> = {
  number: "#,##0.0",
  integer: "#,##0",
  money: '"$"#,##0',
  date: "yyyy-mm-dd",
};

export async function buildWorkbook({
  sheetName,
  columns,
  rows,
  title,
  note,
}: {
  sheetName: string;
  columns: ExcelColumn[];
  rows: ExcelRow[];
  /** Shown above the table, so a printed sheet says what it is. */
  title: string;
  /** What was filtered, so an exported extract is not mistaken for everything. */
  note?: string;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CARNAC";
  workbook.created = new Date();

  // Excel rejects : \ / ? * [ ] in sheet names and caps them at 31 characters.
  const sheet = workbook.addWorksheet(sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31));

  const titleRow = sheet.addRow([title]);
  titleRow.font = { bold: true, size: 14 };
  sheet.mergeCells(1, 1, 1, Math.max(columns.length, 1));

  const noteRow = sheet.addRow([note ?? `Exported ${new Date().toISOString().slice(0, 10)}`]);
  noteRow.font = { size: 10, color: { argb: "FF6B7280" } };
  sheet.mergeCells(2, 1, 2, Math.max(columns.length, 1));

  sheet.addRow([]);

  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF2F6" } };
  headerRow.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };

  const headerRowNumber = headerRow.number;

  for (const row of rows) {
    sheet.addRow(
      columns.map((column) => {
        const value = row[column.key];
        if (value == null || value === "") return null;
        if (column.type === "date") return value instanceof Date ? value : new Date(String(value));
        if (column.type && column.type !== "text") {
          const n = typeof value === "number" ? value : Number(value);
          return Number.isFinite(n) ? n : value;
        }
        return value;
      })
    );
  }

  columns.forEach((column, index) => {
    const col = sheet.getColumn(index + 1);
    if (column.type && FORMATS[column.type]) col.numFmt = FORMATS[column.type];

    // Width from the widest value, so nothing lands as ###.
    const longest = rows.reduce((max, row) => {
      const value = row[column.key];
      return Math.max(max, value == null ? 0 : String(value).length);
    }, column.header.length);
    col.width = column.width ?? Math.min(Math.max(longest + 2, 10), 44);
  });

  // Header stays in view when scrolling, and each column gets a filter — this
  // is a sheet someone will sort and slice, not just read.
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber + rows.length, column: Math.max(columns.length, 1) },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** A filename that sorts chronologically and survives every filesystem. */
export function excelFileName(base: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
