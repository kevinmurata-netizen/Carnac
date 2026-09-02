import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listInspections, summarizeInspectionScore } from "@/server/inspections";
import { listSavedFilters } from "@/server/saved-filters";
import { getConditionBands } from "@/server/settings";
import { buildWorkbook, excelFileName, XLSX_CONTENT_TYPE, type ExcelColumn } from "@/server/excel";
import { inspectionFiltersFromParams, paramsFromRequest, describeFilters } from "@/server/grid-params";
import { ASSET_LABEL } from "@/config/labels";

/**
 * Inspections as a spreadsheet, matching the grid's filters and sort.
 *
 * Each numeric rating gets its own column. On screen they live behind a click
 * into the inspection; in a spreadsheet they are the point — comparing
 * corrosion across a hundred inspections is exactly the job Excel is for.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const organizationId = session.user.organizationId;
  const params = paramsFromRequest(request);

  const [filters, bands] = await Promise.all([
    inspectionFiltersFromParams(organizationId, params),
    getConditionBands(organizationId),
  ]);
  const inspections = await listInspections(organizationId, filters);

  // WCI is derived, so the page sorts it after loading; the export has to do
  // the same or the file would come back in a different order than the screen.
  const ordered =
    params.sort === "wci"
      ? [...inspections].sort((a, b) => {
          const av = summarizeInspectionScore(a, bands)?.score ?? null;
          const bv = summarizeInspectionScore(b, bands)?.score ?? null;
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return params.dir === "desc" ? bv - av : av - bv;
        })
      : inspections;

  // Rating columns are discovered from the data, so a template gaining a
  // question exports it without this file being touched.
  const ratingFields = new Map<string, string>();
  for (const inspection of ordered) {
    for (const result of inspection.results) {
      if (result.field.dataType === "NUMBER") ratingFields.set(result.field.code, result.field.label);
    }
  }

  const columns: ExcelColumn[] = [
    { key: "assetCode", header: ASSET_LABEL.singular, type: "text" },
    { key: "date", header: "Date", type: "date" },
    { key: "type", header: "Type", type: "text" },
    { key: "inspector", header: "Inspector", type: "text" },
    { key: "wci", header: "WCI score", type: "number" },
    { key: "band", header: "Condition band", type: "text" },
    { key: "quality", header: "Data quality (%)", type: "integer" },
    { key: "followUp", header: "Follow-up", type: "text" },
    ...[...ratingFields].map(([code, label]) => ({ key: `r_${code}`, header: label, type: "number" as const })),
    { key: "notes", header: "Notes", type: "text", width: 50 },
  ];

  const rows = ordered.map((inspection) => {
    const condition = summarizeInspectionScore(inspection, bands);
    const ratings = Object.fromEntries(
      inspection.results
        .filter((r) => r.field.dataType === "NUMBER")
        .map((r) => [`r_${r.field.code}`, r.numberValue])
    );

    return {
      assetCode: inspection.asset.assetCode,
      date: inspection.inspectionDate,
      type: inspection.inspectionType,
      inspector: inspection.inspector.name,
      wci: condition?.score ?? null,
      band: condition?.band.label ?? null,
      quality: inspection.qualityScore != null ? Math.round(inspection.qualityScore * 100) : null,
      followUp: inspection.requiresFollowUp ? "Required" : "",
      ...ratings,
      notes: inspection.notes,
    };
  });

  const savedFilterName = params.savedFilter
    ? (await listSavedFilters(organizationId)).find((f) => f.id === params.savedFilter)?.name
    : undefined;

  const buffer = await buildWorkbook({
    sheetName: "Inspections",
    title: `Inspections — ${rows.length.toLocaleString()} record${rows.length === 1 ? "" : "s"}`,
    note: describeFilters(params, savedFilterName),
    columns,
    rows,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${excelFileName("inspections")}"`,
      "Cache-Control": "no-store",
    },
  });
}
