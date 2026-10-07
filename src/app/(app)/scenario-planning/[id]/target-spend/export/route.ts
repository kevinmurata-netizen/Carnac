import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getScenario } from "@/server/scenarios";
import { buildWorkbook, excelFileName, XLSX_CONTENT_TYPE, type ExcelColumn } from "@/server/excel";
import { targetPhases } from "@/lib/target-phases";

/**
 * A target run's Annual Spend grid as a spreadsheet: every year of the run
 * with its phase, what it spent, and where the network stood.
 *
 * The same rows and labels as the card on the scenario page — the phases come
 * from the one helper both use — so the file and the screen agree.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const scenario = await getScenario(session.user.organizationId, id);
  if (!scenario) return new NextResponse("Scenario not found", { status: 404 });
  const target = scenario.target;
  if (!target) return new NextResponse("This scenario is not a target run, or has not run since it became one", { status: 404 });

  const { aim, phaseOf } = targetPhases(target, scenario.assumptions.afterTarget);
  const years = scenario.years;
  const askedYear = years[target.inYears - 1]?.year;
  const aimYear = years[aim - 1]?.year;

  const columns: ExcelColumn[] = [
    { key: "year", header: "Year", type: "integer", width: 8 },
    { key: "phase", header: "Phase", width: 14 },
    { key: "spend", header: "Spend", type: "money", width: 16 },
    { key: "avgCondition", header: "Avg Condition", type: "number", width: 15 },
    { key: "belowTarget", header: `Below ${target.value}`, type: "integer", width: 12 },
  ];

  const buffer = await buildWorkbook({
    sheetName: "Annual Spend",
    columns,
    rows: years.map((y, i) => ({
      year: y.year,
      phase: phaseOf(i),
      spend: y.spend,
      avgCondition: y.avgCondition,
      belowTarget: y.belowTargetCount,
    })),
    title: `${scenario.name} — Annual Spend to Reach WCI ${target.value}`,
    // What the run answered, and when it ran: results are stored, so a file
    // exported today from a run made last week should say last week.
    note: [
      `Target WCI ${target.value} by ${askedYear ?? `year ${target.inYears}`}`,
      target.aimedFor != null ? `not reachable then; aimed for ${aimYear}` : target.reachable ? "reached" : "not reachable",
      `$${Math.round(target.annualBudget).toLocaleString("en-US")} a year`,
      scenario.assumptions.afterTarget === "none" ? "nothing new after the target year" : "held after the target year",
      scenario.lastRunAt ? `run ${scenario.lastRunAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : "not yet run",
    ].join(" · "),
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${excelFileName(`${scenario.name} Annual Spend`)}"`,
      "Cache-Control": "no-store",
    },
  });
}
