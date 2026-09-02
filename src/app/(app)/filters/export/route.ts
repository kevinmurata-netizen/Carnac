import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFilterSchema, loadFilterRows, applyCriteria, fieldIndex, ROW_ASSET_ID } from "@/server/filter-schema";
import { buildWorkbook, excelFileName, XLSX_CONTENT_TYPE, type ExcelColumn } from "@/server/excel";

/**
 * The Filters page's result set as a spreadsheet.
 *
 * A POST rather than a link, because the filter being looked at may never have
 * been saved — it exists only in the builder. The definition is posted as a
 * form field and the browser downloads the response, so an unsaved filter
 * exports as readily as a saved one.
 *
 * The definition is re-run here rather than trusting rows from the browser:
 * what gets exported is what the criteria actually select, not what a page
 * claimed they did — and, importantly, *all* of them. The preview on the page
 * is capped at 500 rows, and the CSV download used to export that capped list
 * while the page promised "export for the rest".
 *
 * Serves both formats so the two cannot drift apart in that way again.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const organizationId = session.user.organizationId;
  const form = await request.formData();

  let definition: { name?: unknown; fields?: unknown; criteria?: unknown; matchAll?: unknown };
  try {
    definition = JSON.parse(String(form.get("definition") ?? "{}"));
  } catch {
    return new NextResponse("Malformed filter definition", { status: 400 });
  }

  const schema = await getFilterSchema(organizationId);
  const byKey = fieldIndex(schema);
  const typeByField = new Map(schema.flatMap((t) => t.fields.map((f) => [f.key, f.type] as const)));

  // Only fields the schema actually has, so a crafted payload cannot name a
  // column that was never meant to leave the system.
  const fields = (Array.isArray(definition.fields) ? definition.fields : [])
    .filter((f): f is string => typeof f === "string" && byKey.has(f));

  const criteria = (Array.isArray(definition.criteria) ? definition.criteria : []).filter(
    (c): c is { field: string; operator: string; value: string; value2?: string } =>
      !!c && typeof c === "object" && typeof (c as { field?: unknown }).field === "string"
  );

  const name = typeof definition.name === "string" && definition.name.trim() ? definition.name.trim() : "Filter";
  const matchAll = definition.matchAll !== false;

  const rows = applyCriteria(
    await loadFilterRows(organizationId),
    criteria as Parameters<typeof applyCriteria>[1],
    matchAll,
    typeByField
  );

  const columns: ExcelColumn[] = (fields.length > 0 ? fields : [...byKey.keys()].slice(0, 8)).map((key) => {
    const field = byKey.get(key)!;
    return {
      key,
      header: field.label,
      type: field.type === "number" ? "number" : field.type === "date" ? "date" : "text",
    };
  });

  const described =
    criteria.length === 0
      ? "no criteria — every segment"
      : `${matchAll ? "all" : "any"} of ${criteria.length} criteri${criteria.length === 1 ? "on" : "a"}`;

  const exportRows = rows.map((row) => {
    // The internal id is stripped: it is on the row so a filter can drive a
    // grid, and it has no business in a file someone emails on.
    const { [ROW_ASSET_ID]: _id, ...rest } = row;
    return rest;
  });

  if (String(form.get("format") ?? "xlsx") === "csv") {
    const escape = (v: unknown) => {
      const text = v == null ? "" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [
      columns.map((c) => escape(c.header)).join(","),
      ...exportRows.map((row) => columns.map((c) => escape(row[c.key])).join(",")),
    ].join("\n");

    return new NextResponse(`﻿${csv}`, {
      headers: {
        // UTF-8 BOM so Excel opens accented characters correctly.
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${excelFileName(name).replace(/\.xlsx$/, ".csv")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await buildWorkbook({
    sheetName: name,
    title: `${name} — ${rows.length.toLocaleString()} segment${rows.length === 1 ? "" : "s"}`,
    note: `Exported ${new Date().toISOString().slice(0, 10)} · matching ${described}`,
    columns,
    rows: exportRows,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${excelFileName(name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
