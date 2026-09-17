import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllScenarioAlternatives, getScenarioAlternatives } from "@/server/scenario-alternatives";
import { outcomeLegend } from "@/domain/waterline/alternative-reasons";
import { buildWorkbook, excelFileName, XLSX_CONTENT_TYPE, type ExcelColumn } from "@/server/excel";

/**
 * Every alternative a scenario considered, as a spreadsheet.
 *
 * `?year=all` is the whole run — tens of thousands of rows, which is exactly
 * what a file is for and exactly what the page refuses to render. With
 * `&asset=` it is one segment across every year, matching the page's all-years
 * view.
 */

const COLUMNS: ExcelColumn[] = [
  { key: "year", header: "Year", type: "integer", width: 8 },
  { key: "assetCode", header: "Segment", width: 14 },
  { key: "conditionBefore", header: "WCI Before", type: "number", width: 12 },
  { key: "optionLabel", header: "Option", width: 26 },
  { key: "members", header: "Treatments", width: 30 },
  { key: "isCombination", header: "Combination", width: 13 },
  { key: "category", header: "Category", width: 14 },
  { key: "cost", header: "Total Cost", type: "money", width: 14 },
  { key: "criticality", header: "Criticality", type: "number", width: 12 },
  { key: "scaleFactor", header: "Scale Factor", type: "number", width: 13 },
  { key: "categoryWeight", header: "Category Weight", type: "number", width: 16 },
  { key: "benefit", header: "Expected Benefit", type: "number", width: 16 },
  { key: "priority", header: "Priority Score", type: "number", width: 15 },
  { key: "incremental", header: "Incremental Score", type: "number", width: 17 },
  { key: "incrementalOver", header: "Incremental Over", width: 24 },
  { key: "conditionAfter", header: "WCI After", type: "number", width: 11 },
  { key: "riskBefore", header: "Risk Before", type: "number", width: 12 },
  { key: "riskAfter", header: "Risk After", type: "number", width: 11 },
  { key: "selected", header: "Selected", width: 10 },
  { key: "reason", header: "Outcome", width: 32 },
  { key: "reasonDetail", header: "What the Outcome Means", width: 70 },
];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const organizationId = session.user.organizationId;
  const search = new URL(request.url).searchParams;
  const yearParam = search.get("year");
  const assetParam = search.get("asset");
  const allYears = yearParam === "all";
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;
  const assetId = assetParam && /^[A-Za-z0-9_-]{1,64}$/.test(assetParam) ? assetParam : undefined;

  const data = allYears
    ? await getAllScenarioAlternatives(organizationId, id, assetId)
    : await getScenarioAlternatives(organizationId, id, { year });
  if (!data) return new NextResponse("Not found", { status: 404 });

  const legend = outcomeLegend(new Set(data.rows.map((r) => r.reason)));
  const rows = data.rows.map((r) => ({
    year: r.year,
    assetCode: r.assetCode,
    conditionBefore: r.conditionBefore,
    optionLabel: r.optionLabel,
    members: r.members.join(" + "),
    isCombination: r.isCombination ? "Yes" : "No",
    category: r.category,
    cost: r.cost,
    criticality: r.criticality,
    scaleFactor: r.scaleFactor,
    categoryWeight: r.categoryWeight,
    benefit: r.benefit,
    priority: r.priority,
    incremental: r.incremental,
    incrementalOver: r.incremental == null ? "" : (r.incrementalOver ?? "Doing nothing"),
    conditionAfter: r.conditionAfter,
    riskBefore: r.riskBefore,
    riskAfter: r.riskAfter,
    selected: r.selected ? "Yes" : "No",
    reason: r.reason,
    reasonDetail: legend[r.reason]?.description ?? "",
  }));

  const segmentCode = "segmentCode" in data ? data.segmentCode : null;
  const scope = allYears
    ? segmentCode
      ? `${segmentCode}, every year`
      : "every year"
    : `${"year" in data ? data.year : year}`;
  const selected = rows.filter((r) => r.selected === "Yes").length;
  const buffer = await buildWorkbook({
    sheetName: "Alternatives",
    columns: COLUMNS,
    rows,
    title: `Alternatives considered — ${data.scenarioName}`,
    note:
      `${rows.length.toLocaleString()} alternatives over ${scope}, ${selected.toLocaleString()} funded · ` +
      `Priority Score is Criticality × Scale Factor × Category Weight × Expected Benefit ÷ Total Cost, computed against each year's condition; ` +
      `work is bought by Incremental Score — the weighted benefit an option adds over the next cheaper option worth having on its segment, per extra dollar; ` +
      `benefit is normalized within a year, so scores rank options inside their own year only · exported ${new Date()
        .toISOString()
        .slice(0, 10)}`,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${excelFileName(
        `${data.scenarioName} Alternatives ${scope}`
      )}"`,
      "Cache-Control": "no-store",
    },
  });
}
