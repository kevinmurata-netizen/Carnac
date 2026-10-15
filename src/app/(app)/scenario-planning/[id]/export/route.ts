import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAssetWords } from "@/server/branding";
import { withAssetWords } from "@/lib/branding";
import { getScenario, getScenarioProjects } from "@/server/scenarios";
import { buildWorkbook, excelFileName, XLSX_CONTENT_TYPE, type ExcelColumn } from "@/server/excel";

/**
 * A scenario's funded projects as a spreadsheet.
 *
 * A GET, unlike the Filters export, because there is nothing unsaved to post —
 * the run is already stored, and what is wanted is exactly what the table
 * shows. That also makes it a plain link, so it works with the middle mouse
 * button and can be bookmarked.
 *
 * Every funded project, not the page's slice. The table groups by year and can
 * be long; someone exporting it wants the program, not the part that
 * happened to be rendered.
 */
const COLUMNS: ExcelColumn[] = [
  // Three years, because delivery lead times can put them three years apart:
  // when the money leaves, when the work was decided, when it is built. All
  // the same figure for a run without them.
  { key: "year", header: "Paid Year", type: "integer", width: 11 },
  { key: "programmedYear", header: "Decided Year", type: "integer", width: 13 },
  { key: "buildYear", header: "Built Year", type: "integer", width: 11 },
  { key: "assetCode", header: "{Item}", width: 14 },
  { key: "serviceArea", header: "Service Area", width: 18 },
  { key: "treatment", header: "Treatment", width: 22 },
  // Rows sharing a bundle are one visit, with the cost divided between them
  // and one set of condition and risk figures.
  { key: "bundleName", header: "Part of Bundle", width: 22 },
  { key: "cost", header: "Cost", type: "money", width: 14 },
  { key: "conditionBefore", header: "Condition Before", type: "number", width: 16 },
  { key: "conditionAfter", header: "Condition After", type: "number", width: 16 },
  { key: "riskBefore", header: "Risk Before", type: "number", width: 13 },
  { key: "riskAfter", header: "Risk After", type: "number", width: 13 },
  { key: "riskReductionPct", header: "Risk Reduction %", type: "number", width: 17 },
];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const organizationId = session.user.organizationId;
  const words = await getAssetWords(organizationId);

  const [scenario, projects] = await Promise.all([
    getScenario(organizationId, id),
    getScenarioProjects(organizationId, id),
  ]);
  if (!scenario) return new NextResponse("Scenario not found", { status: 404 });

  const totalCost = projects.reduce((sum, p) => sum + p.cost, 0);
  const years = projects.length > 0 ? `${projects[0].year}–${projects[projects.length - 1].year}` : "no years";

  // Corridor columns only on a run that bundled anything, so every other
  // export keeps the layout it has always had.
  const bundled = projects.some((p) => p.corridor);
  const columns = bundled
    ? [
        ...COLUMNS,
        { key: "corridorWith", header: "Bundled With", width: 14 },
        { key: "corridorSaving", header: "Corridor Saving", type: "money" as const, width: 16 },
      ]
    : COLUMNS;

  const buffer = await buildWorkbook({
    sheetName: "Funded Projects",
    columns: columns.map((c) => ({ ...c, header: withAssetWords(c.header, words) })),
    rows: projects.map(({ corridor, ...p }) => ({
      ...p,
      ...(bundled ? { corridorWith: corridor?.withAssetCode ?? null, corridorSaving: corridor?.saving ?? null } : {}),
    })),
    title: `${scenario.name} — Funded Projects`,
    // The run date rather than today's, because a scenario's results are
    // stored: exporting on Friday a run made on Monday should say Monday.
    note: `${projects.length.toLocaleString()} projects, ${years}, $${totalCost.toLocaleString(
      "en-US"
    )} total · ${scenario.lastRunAt ? `run ${scenario.lastRunAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : "not yet run"}`,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${excelFileName(`${scenario.name} Funded Projects`)}"`,
      "Cache-Control": "no-store",
    },
  });
}
