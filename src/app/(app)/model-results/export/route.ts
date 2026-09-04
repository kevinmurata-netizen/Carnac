import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWciFlow, listScenarioOptions } from "@/server/model-results";
import { buildWorkbookSheets, excelFileName, XLSX_CONTENT_TYPE, type ExcelColumn } from "@/server/excel";
import { ASSET_LABEL } from "@/config/labels";

/**
 * A scenario's outcome as a two-sheet workbook.
 *
 * Transitions is the summary the page shows; Segments is every segment behind
 * it. They go in one file rather than two so a figure in the summary can be
 * traced to the rows that produced it — which is the question the drill-down
 * on the page answers, and the one a spreadsheet should answer too.
 */
const TRANSITION_COLUMNS: ExcelColumn[] = [
  { key: "fromBand", header: "From", type: "text" },
  { key: "toBand", header: "To", type: "text" },
  { key: "segments", header: "Segments", type: "integer" },
  { key: "share", header: "Share (%)", type: "number" },
  { key: "direction", header: "Direction", type: "text" },
];

const SEGMENT_COLUMNS: ExcelColumn[] = [
  { key: "assetCode", header: ASSET_LABEL.singular, type: "text" },
  { key: "material", header: "Material", type: "text" },
  { key: "fromBand", header: "Start band", type: "text" },
  { key: "toBand", header: "End band", type: "text" },
  { key: "startCondition", header: "Start WCI", type: "number" },
  { key: "endCondition", header: "End WCI", type: "number" },
  { key: "change", header: "Change", type: "number" },
  { key: "treatments", header: "Treatments applied", type: "integer" },
  { key: "direction", header: "Direction", type: "text" },
];

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const organizationId = session.user.organizationId;
  const search = new URL(request.url).searchParams;
  const requested = search.get("scenario") ?? undefined;
  // Present when the export came from an opened transition rather than the
  // section heading — the file is then just that band-to-band path.
  const fromBand = search.get("from");
  const toBand = search.get("to");

  // Same selection rule as the page: the requested scenario if it has results,
  // otherwise the first that does.
  const runnable = (await listScenarioOptions(organizationId)).filter((o) => o.hasResults);
  const selectedId = runnable.find((o) => o.id === requested)?.id ?? runnable[0]?.id;
  if (!selectedId) return new NextResponse("No scenario has been run yet", { status: 404 });

  const flow = await getWciFlow(organizationId, selectedId);
  if (!flow) return new NextResponse("Scenario has no results", { status: 404 });

  const note =
    `Exported ${new Date().toISOString().slice(0, 10)} · ${flow.scenarioName} · ` +
    `${flow.strategy} over ${flow.years} years · average WCI ${flow.startAvg} → ${flow.endAvg}`;

  // One transition asked for on its own: a single sheet of just its segments.
  // Named for the path so the file is identifiable once it has left the app.
  if (fromBand && toBand) {
    const link = flow.links.find((l) => l.fromBand === fromBand && l.toBand === toBand);
    if (!link) return new NextResponse("No such transition in this scenario", { status: 404 });

    const buffer = await buildWorkbookSheets([
      {
        sheetName: "Segments",
        title: `${link.fromBand} → ${link.toBand} — ${link.value.toLocaleString()} segments`,
        note,
        columns: SEGMENT_COLUMNS,
        rows: link.assets.map((asset) => ({
          assetCode: asset.assetCode,
          material: asset.material,
          fromBand: link.fromBand,
          toBand: link.toBand,
          startCondition: asset.startCondition,
          endCondition: asset.endCondition,
          change: Math.round((asset.endCondition - asset.startCondition) * 10) / 10,
          treatments: asset.treatments,
          direction: link.direction,
        })),
      },
    ]);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${excelFileName(
          `${flow.scenarioName}-${link.fromBand}-to-${link.toBand}`
        )}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const transitions = flow.links.map((link) => ({
    fromBand: link.fromBand,
    toBand: link.toBand,
    segments: link.value,
    share: flow.assetCount > 0 ? Math.round((link.value / flow.assetCount) * 1000) / 10 : 0,
    direction: link.direction,
  }));

  // Flattened out of the same links the summary counts, so the two sheets
  // cannot disagree about which segment took which path.
  const segments = flow.links.flatMap((link) =>
    link.assets.map((asset) => ({
      assetCode: asset.assetCode,
      material: asset.material,
      fromBand: link.fromBand,
      toBand: link.toBand,
      startCondition: asset.startCondition,
      endCondition: asset.endCondition,
      change: Math.round((asset.endCondition - asset.startCondition) * 10) / 10,
      treatments: asset.treatments,
      direction: link.direction,
    }))
  );

  const buffer = await buildWorkbookSheets([
    {
      sheetName: "Transitions",
      title: `Condition flow — ${flow.scenarioName}`,
      note,
      columns: TRANSITION_COLUMNS,
      rows: transitions,
    },
    {
      sheetName: "Segments",
      title: `Every segment traced — ${segments.length.toLocaleString()} rows`,
      note,
      columns: SEGMENT_COLUMNS,
      rows: segments,
    },
  ]);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${excelFileName(`model-results-${flow.scenarioName}`)}"`,
      "Cache-Control": "no-store",
    },
  });
}
