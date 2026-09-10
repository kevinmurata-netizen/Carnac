import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNetworkRecommendations } from "@/server/treatments";
import { rankOptions } from "@/server/priority";
import { buildWorkbook, excelFileName, XLSX_CONTENT_TYPE, type ExcelColumn } from "@/server/excel";

/**
 * Either of the Treatment Planning tables as a spreadsheet.
 *
 * Both export in full rather than the 25 rows each table renders. That is the
 * point of the button: the page shows enough to judge the shape of the answer,
 * and the file is for the person who has to work through it.
 *
 * The Ranked Options export deliberately includes the options the
 * effectiveness floor rules out, with a column saying so. On screen they are
 * hidden because they cannot be funded; in a file, someone checking why a
 * cheap option was passed over needs to find it rather than conclude it was
 * never considered.
 */

const RECOMMENDED: ExcelColumn[] = [
  { key: "assetCode", header: "Segment", width: 14 },
  { key: "conditionScore", header: "Condition", type: "number", width: 11 },
  { key: "riskScore", header: "Risk", type: "number", width: 10 },
  { key: "treatment", header: "Recommended Treatment", width: 24 },
  { key: "category", header: "Category", width: 14 },
  { key: "estimatedCost", header: "Estimated Cost", type: "money", width: 15 },
  { key: "riskReductionPct", header: "Risk Reduction %", type: "number", width: 17 },
  { key: "criticalityScore", header: "Criticality", type: "number", width: 12 },
  { key: "expectedBenefit", header: "Expected Benefit", type: "number", width: 16 },
  { key: "scaleFactor", header: "Scale Factor", type: "number", width: 13 },
  { key: "categoryWeight", header: "Category Weight", type: "number", width: 16 },
  { key: "value", header: "Priority Score", type: "number", width: 15 },
  { key: "conditionImprovement", header: "Condition Gain (WCI)", type: "number", width: 19 },
  { key: "riskReduction", header: "Risk Points Removed", type: "number", width: 19 },
  { key: "lifeCycleSaving", header: "Life-Cycle Saving", type: "money", width: 18 },
];

const RANKED: ExcelColumn[] = [
  { key: "rank", header: "Rank", type: "integer", width: 8 },
  { key: "assetCode", header: "Segment", width: 14 },
  { key: "conditionScore", header: "Condition", type: "number", width: 11 },
  { key: "riskScore", header: "Risk", type: "number", width: 10 },
  { key: "optionLabel", header: "Option", width: 24 },
  { key: "members", header: "Treatments", width: 30 },
  { key: "isCombination", header: "Combination", width: 13 },
  { key: "category", header: "Category", width: 14 },
  { key: "totalCost", header: "Total Cost", type: "money", width: 14 },
  { key: "criticality", header: "Criticality", type: "number", width: 12 },
  { key: "scaleFactor", header: "Scale Factor", type: "number", width: 13 },
  { key: "categoryWeight", header: "Category Weight", type: "number", width: 16 },
  { key: "expectedBenefit", header: "Expected Benefit", type: "number", width: 16 },
  { key: "priority", header: "Priority Score", type: "number", width: 15 },
  { key: "riskReductionPct", header: "Risk Reduction %", type: "number", width: 17 },
  { key: "fundable", header: "Fundable", width: 11 },
  { key: "isRecommended", header: "Is Recommendation", width: 18 },
];

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const organizationId = session.user.organizationId;
  const list = new URL(request.url).searchParams.get("list") === "ranked" ? "ranked" : "recommended";
  const today = new Date().toISOString().slice(0, 10);

  if (list === "ranked") {
    const ranking = await rankOptions(organizationId);
    const rows = ranking.rows.map((r, i) => ({
      rank: i + 1,
      assetCode: r.assetCode,
      conditionScore: r.conditionScore,
      riskScore: r.riskScore,
      optionLabel: r.optionLabel,
      members: r.members.join(" + "),
      isCombination: r.isCombination ? "Yes" : "No",
      category: r.category,
      totalCost: r.totalCost,
      criticality: Math.round(r.criticality * 10) / 10,
      scaleFactor: r.scaleFactor,
      categoryWeight: r.categoryWeight,
      expectedBenefit: r.expectedBenefit,
      priority: r.priority,
      riskReductionPct: r.riskReductionPct,
      fundable: r.eligible ? "Yes" : `No — below ${ranking.floor.minRiskReductionPct}% floor`,
      isRecommended: r.isRecommended ? "Yes" : "",
    }));

    const buffer = await buildWorkbook({
      sheetName: "Ranked Options",
      columns: RANKED,
      rows,
      title: "Ranked Options — Criticality × Scale × Category × Benefit ÷ Total Cost",
      note: `${rows.length.toLocaleString()} options over ${ranking.assetsWithOptions.toLocaleString()} segments (${ranking.combinationsScored.toLocaleString()} combinations) · ${ranking.weightSetName} · ${ranking.categoryWeightSetName} · scale factor ${ranking.scaleFactorName ?? "none"} · ${ranking.belowFloor.toLocaleString()} below the effectiveness floor · exported ${today}`,
    });

    return file(buffer, "Ranked Options");
  }

  const recommendations = await getNetworkRecommendations(organizationId);
  const rows = recommendations.rows.map((r) => ({
    assetCode: r.assetCode,
    conditionScore: r.conditionScore,
    riskScore: r.riskScore,
    treatment: r.treatment,
    category: r.category,
    estimatedCost: r.estimatedCost,
    riskReductionPct: r.riskReductionPct,
    criticalityScore: r.criticalityScore,
    expectedBenefit: r.expectedBenefit,
    scaleFactor: r.scaleFactor,
    categoryWeight: r.categoryWeight,
    value: r.value,
    // The three terms behind the benefit score, so the figure can be checked
    // rather than taken on trust — the same decomposition the tooltip shows.
    conditionImprovement: Math.round(r.benefitTerms.conditionImprovement * 10) / 10,
    riskReduction: Math.round(r.benefitTerms.riskReduction * 10) / 10,
    lifeCycleSaving: Math.round(r.benefitTerms.lifeCycleSaving),
  }));

  const buffer = await buildWorkbook({
    sheetName: "Recommended Treatments",
    columns: RECOMMENDED,
    rows,
    title: "Recommended Treatments",
    note: `${rows.length.toLocaleString()} segments with a recommendation, $${Math.round(
      recommendations.totalEstimatedCost
    ).toLocaleString("en-US")} identified need · ${recommendations.noActionCount.toLocaleString()} need no action · exported ${today}`,
  });

  return file(buffer, "Recommended Treatments");
}

function file(buffer: Buffer, name: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${excelFileName(name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
