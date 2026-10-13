import { prisma } from "@/lib/prisma";
import { getMeasureCodes, readMeasures } from "@/server/measures";
import { getConditionBand } from "@/domain/waterline/condition";
import { getRiskBand } from "@/domain/waterline/risk";
import { getNetworkRecommendations } from "@/server/treatments";
import { listScenarios } from "@/server/scenarios";
import { getAssetLcca } from "@/server/lcca";
import { ageInYears } from "@/lib/format";
import { getConditionBands } from "@/server/settings";
import { MODELLED } from "@/server/modelled-asset-type";
import { withIndex, type IndexWords } from "@/lib/index-words";
import { withAssetWords, type AssetWords } from "@/lib/branding";

/**
 * Report definitions are data, not bespoke endpoints: each one declares its
 * columns and an async row producer. Serialization is separate, so adding
 * PDF or Excel later means writing one more serializer over this same shape
 * rather than touching any report — the extensibility SPEC §33 asks for.
 */
export type ColumnFormat = "text" | "number" | "currency" | "date" | "percent";

export type ReportColumn = {
  key: string;
  label: string;
  format?: ColumnFormat;
};

export type ReportCategory = "Inventory" | "Condition & Risk" | "Planning" | "Financial";

export type ReportRow = Record<string, string | number | null>;

export type ReportDefinition = {
  id: string;
  name: string;
  description: string;
  category: ReportCategory;
  columns: ReportColumn[];
  run: (organizationId: string) => Promise<ReportRow[]>;
};

// ---------------------------------------------------------------------------
// Shared query helpers
// ---------------------------------------------------------------------------

/** Modelled assets with what the reports show, each with its measures read
 * through its own asset type's fields. */
async function assetsWithContext(organizationId: string) {
  const [assets, measuresOf] = await Promise.all([
    prisma.asset.findMany({
      where: { organizationId, assetType: MODELLED, deletedAt: null },
      include: {
        attributeValues: { include: { definition: true } },
        location: true,
        conditionMeasurements: { where: { assetComponentId: null }, orderBy: { measurementDate: "desc" }, take: 1 },
        riskAssessments: { where: { assetComponentId: null }, orderBy: { assessmentDate: "desc" }, take: 1 },
      },
      orderBy: { assetCode: "asc" },
    }),
    getMeasureCodes(organizationId),
  ]);
  return assets.map((a) => ({ ...a, measures: readMeasures(a.attributeValues, measuresOf(a.assetTypeId)) }));
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

// ---------------------------------------------------------------------------
// Report definitions
// ---------------------------------------------------------------------------

export const REPORTS: ReportDefinition[] = [
  {
    id: "asset-inventory",
    name: "Asset Inventory",
    description: "Full {asset} inventory with physical and operational attributes.",
    category: "Inventory",
    columns: [
      { key: "assetCode", label: "Asset ID" },
      { key: "status", label: "Status" },
      { key: "material", label: "Material" },
      { key: "diameterIn", label: "Diameter (in)", format: "number" },
      { key: "lengthFt", label: "Length (ft)", format: "number" },
      { key: "installationDate", label: "Installation Date", format: "date" },
      { key: "ageYears", label: "Age (yr)", format: "number" },
      { key: "serviceArea", label: "Service Area" },
      { key: "pressureZone", label: "Pressure Zone" },
      { key: "criticality", label: "Criticality" },
      { key: "customersServed", label: "Customers Served", format: "number" },
      { key: "ownerDepartment", label: "Department" },
    ],
    run: async (organizationId) => {
      const assets = await assetsWithContext(organizationId);
      return assets.map((a) => ({
        assetCode: a.assetCode,
        status: a.status,
        material: a.measures.material,
        diameterIn: a.measures.diameter,
        lengthFt: a.measures.length,
        installationDate: iso(a.installationDate),
        ageYears: ageInYears(a.installationDate),
        serviceArea: a.location?.serviceArea ?? null,
        pressureZone: a.location?.pressureZone ?? null,
        criticality: a.measures.criticality,
        customersServed: a.measures.customersServed,
        ownerDepartment: a.ownerDepartment,
      }));
    },
  },
  {
    id: "condition",
    name: "Condition",
    description: "Latest {indexName} by {item}, with band and measurement date.",
    category: "Condition & Risk",
    columns: [
      { key: "assetCode", label: "Asset ID" },
      { key: "material", label: "Material" },
      { key: "wci", label: "{index}", format: "number" },
      { key: "band", label: "Condition Band" },
      { key: "measuredOn", label: "Last Measured", format: "date" },
      { key: "serviceArea", label: "Service Area" },
    ],
    run: async (organizationId) => {
      const assets = await assetsWithContext(organizationId);
      const bands = await getConditionBands(organizationId);
      return assets.map((a) => {
        const m = a.conditionMeasurements[0];
        return {
          assetCode: a.assetCode,
          material: a.measures.material,
          wci: m ? Math.round(m.score * 10) / 10 : null,
          band: m ? getConditionBand(m.score, bands).label : "Not inspected",
          measuredOn: iso(m?.measurementDate),
          serviceArea: a.location?.serviceArea ?? null,
        };
      });
    },
  },
  {
    id: "risk",
    name: "Risk",
    description: "Probability, consequence and resulting risk score per {item}.",
    category: "Condition & Risk",
    columns: [
      { key: "assetCode", label: "Asset ID" },
      { key: "pof", label: "Probability (1-5)", format: "number" },
      { key: "cof", label: "Consequence (1-5)", format: "number" },
      { key: "riskScore", label: "Risk Score", format: "number" },
      { key: "band", label: "Risk Band" },
      { key: "assessedOn", label: "Assessed", format: "date" },
    ],
    run: async (organizationId) => {
      const assets = await assetsWithContext(organizationId);
      return assets
        .filter((a) => a.riskAssessments.length > 0)
        .map((a) => {
          const r = a.riskAssessments[0];
          return {
            assetCode: a.assetCode,
            pof: r.probabilityScore,
            cof: r.consequenceScore,
            riskScore: r.riskScore,
            band: getRiskBand(r.riskScore).label,
            assessedOn: iso(r.assessmentDate),
          };
        })
        .sort((a, b) => (b.riskScore as number) - (a.riskScore as number));
    },
  },
  {
    id: "inspection-history",
    name: "Inspection History",
    description: "Every recorded inspection with inspector, type and resulting condition.",
    category: "Condition & Risk",
    columns: [
      { key: "assetCode", label: "Asset ID" },
      { key: "inspectionDate", label: "Date", format: "date" },
      { key: "inspectionType", label: "Type" },
      { key: "inspector", label: "Inspector" },
      { key: "wci", label: "Resulting {index}", format: "number" },
      { key: "qualityScore", label: "Data Quality", format: "percent" },
      { key: "requiresFollowUp", label: "Follow-up Required" },
      { key: "notes", label: "Notes" },
    ],
    run: async (organizationId) => {
      const inspections = await prisma.inspection.findMany({
        where: { asset: { organizationId, deletedAt: null }, assetComponentId: null },
        include: {
          asset: { select: { assetCode: true } },
          inspector: { select: { name: true } },
          conditionMeasurements: { where: { assetComponentId: null }, select: { score: true } },
        },
        orderBy: { inspectionDate: "desc" },
      });
      return inspections.map((i) => ({
        assetCode: i.asset.assetCode,
        inspectionDate: iso(i.inspectionDate),
        inspectionType: i.inspectionType,
        inspector: i.inspector.name,
        wci: i.conditionMeasurements[0]?.score ?? null,
        qualityScore: i.qualityScore != null ? Math.round(i.qualityScore * 100) : null,
        requiresFollowUp: i.requiresFollowUp ? "Yes" : "No",
        notes: i.notes,
      }));
    },
  },
  {
    id: "failure-history",
    name: "Failure History",
    description: "Recorded failures with cause, severity, cost and customer impact.",
    category: "Condition & Risk",
    columns: [
      { key: "assetCode", label: "Asset ID" },
      { key: "failureDate", label: "Date", format: "date" },
      { key: "failureType", label: "Type" },
      { key: "severity", label: "Severity" },
      { key: "cause", label: "Cause" },
      { key: "repairCost", label: "Repair Cost", format: "currency" },
      { key: "downtimeHours", label: "Downtime (hr)", format: "number" },
      { key: "customersAffected", label: "Customers Affected", format: "number" },
    ],
    run: async (organizationId) => {
      const failures = await prisma.failureEvent.findMany({
        where: { asset: { organizationId, deletedAt: null } },
        include: { asset: { select: { assetCode: true } }, failureType: { select: { label: true } } },
        orderBy: { failureDate: "desc" },
      });
      return failures.map((f) => ({
        assetCode: f.asset.assetCode,
        failureDate: iso(f.failureDate),
        failureType: f.failureType.label,
        severity: f.severity,
        cause: f.cause,
        repairCost: f.repairCost != null ? Math.round(f.repairCost) : null,
        downtimeHours: f.downtimeHours,
        customersAffected: f.customersAffected,
      }));
    },
  },
  {
    id: "deterioration-forecast",
    name: "Deterioration Forecast",
    description: "Predicted condition by year under the do-nothing trajectory.",
    category: "Planning",
    columns: [
      { key: "assetCode", label: "Asset ID" },
      { key: "model", label: "Model" },
      { key: "forecastYear", label: "Year", format: "number" },
      { key: "predictedCondition", label: "Predicted {index}", format: "number" },
    ],
    run: async (organizationId) => {
      const rows = await prisma.deteriorationPrediction.findMany({
        where: { scenario: "current", asset: { organizationId, deletedAt: null } },
        include: { asset: { select: { assetCode: true } }, model: { select: { name: true } } },
        orderBy: [{ assetId: "asc" }, { forecastYear: "asc" }],
      });
      return rows.map((p) => ({
        assetCode: p.asset.assetCode,
        model: p.model.name,
        forecastYear: p.forecastYear,
        predictedCondition: p.predictedCondition,
      }));
    },
  },
  {
    id: "treatment-needs",
    name: "Treatment Needs",
    description: "Recommended treatment per {item} with cost and expected risk reduction.",
    category: "Planning",
    columns: [
      { key: "assetCode", label: "Asset ID" },
      { key: "condition", label: "{index}", format: "number" },
      { key: "riskScore", label: "Risk", format: "number" },
      { key: "treatment", label: "Recommended Treatment" },
      { key: "category", label: "Category" },
      { key: "estimatedCost", label: "Estimated Cost", format: "currency" },
      { key: "riskReductionPct", label: "Risk Reduction", format: "percent" },
    ],
    run: async (organizationId) => {
      const recs = await getNetworkRecommendations(organizationId);
      return recs.rows.map((r) => ({
        assetCode: r.assetCode,
        condition: r.conditionScore,
        riskScore: r.riskScore,
        treatment: r.treatment,
        category: r.category,
        estimatedCost: r.estimatedCost,
        riskReductionPct: r.riskReductionPct,
      }));
    },
  },
  {
    id: "capital-needs",
    name: "Capital Needs",
    description: "Identified need rolled up by treatment type.",
    category: "Financial",
    columns: [
      { key: "treatment", label: "Treatment" },
      { key: "segments", label: "{Items}", format: "number" },
      { key: "totalCost", label: "Total Cost", format: "currency" },
      { key: "averageCost", label: "Average Cost", format: "currency" },
    ],
    run: async (organizationId) => {
      const recs = await getNetworkRecommendations(organizationId);
      return recs.byTreatment.map((t) => ({
        treatment: t.treatment,
        segments: t.count,
        totalCost: Math.round(t.cost),
        averageCost: Math.round(t.cost / Math.max(1, t.count)),
      }));
    },
  },
  {
    id: "work-plan",
    name: "Work Plan",
    description: "Multi-year capital program with priority, cost and justification.",
    category: "Planning",
    columns: [
      { key: "plan", label: "Plan" },
      { key: "year", label: "Year", format: "number" },
      { key: "assetCode", label: "Asset ID" },
      { key: "serviceArea", label: "Location" },
      { key: "treatment", label: "Treatment" },
      { key: "estimatedCost", label: "Estimated Cost", format: "currency" },
      { key: "priorityScore", label: "Priority", format: "number" },
      { key: "status", label: "Status" },
      { key: "fundingSource", label: "Funding Source" },
      { key: "reason", label: "Reason" },
    ],
    run: async (organizationId) => {
      const items = await prisma.workPlanItem.findMany({
        where: { asset: { organizationId, deletedAt: null } },
        include: {
          workPlan: { select: { name: true } },
          asset: { select: { assetCode: true, location: { select: { serviceArea: true } } } },
          treatment: { select: { name: true } },
        },
        orderBy: [{ year: "asc" }, { estimatedCost: "desc" }],
      });
      return items.map((i) => {
        const benefit = (i.expectedBenefit ?? {}) as { priorityScore?: number };
        return {
          plan: i.workPlan.name,
          year: i.year,
          assetCode: i.asset.assetCode,
          serviceArea: i.asset.location?.serviceArea ?? null,
          treatment: i.treatment.name,
          estimatedCost: Math.round(i.estimatedCost),
          priorityScore: benefit.priorityScore ?? null,
          status: i.status,
          fundingSource: i.fundingSource,
          reason: i.reasonExplanation,
        };
      });
    },
  },
  {
    id: "scenario-comparison",
    name: "Scenario Comparison",
    description: "Funding scenarios side by side on condition, failures, backlog and spend.",
    category: "Financial",
    columns: [
      { key: "scenario", label: "Scenario" },
      { key: "strategy", label: "Strategy" },
      { key: "annualBudget", label: "Annual Budget", format: "currency" },
      { key: "analysisPeriod", label: "Period (yr)", format: "number" },
      { key: "finalCondition", label: "Final {index}", format: "number" },
      { key: "totalFailures", label: "Expected Failures", format: "number" },
      { key: "finalBacklog", label: "Backlog at End", format: "currency" },
      { key: "totalSpend", label: "Total Spend", format: "currency" },
    ],
    run: async (organizationId) => {
      const scenarios = await listScenarios(organizationId);
      return scenarios.map((s) => ({
        scenario: s.name,
        strategy: s.assumptions.strategy,
        annualBudget: s.assumptions.annualBudget,
        analysisPeriod: s.assumptions.analysisPeriodYears,
        finalCondition: s.finalAvgCondition,
        totalFailures: s.totalFailures,
        finalBacklog: s.finalBacklog,
        totalSpend: s.totalSpend,
      }));
    },
  },
  {
    id: "life-cycle-cost",
    name: "Life Cycle Cost",
    description:
      "Lowest life-cycle-cost option per {item} versus doing nothing, for the highest-risk assets.",
    category: "Financial",
    columns: [
      { key: "assetCode", label: "Asset ID" },
      { key: "riskScore", label: "Risk", format: "number" },
      { key: "bestOption", label: "Lowest LCC Option" },
      { key: "bestNpv", label: "Option NPV", format: "currency" },
      { key: "doNothingNpv", label: "Do-Nothing NPV", format: "currency" },
      { key: "savings", label: "Saving vs Do Nothing", format: "currency" },
    ],
    run: async (organizationId) => {
      // LCCA is per-asset and expensive; cap at the highest-risk segments,
      // which are the ones a capital decision actually turns on.
      const assets = await prisma.asset.findMany({
        where: { organizationId, assetType: MODELLED, deletedAt: null, status: "ACTIVE" },
        include: { riskAssessments: { where: { assetComponentId: null }, orderBy: { assessmentDate: "desc" }, take: 1 } },
      });
      const ranked = assets
        .filter((a) => a.riskAssessments.length > 0)
        .sort((a, b) => b.riskAssessments[0].riskScore - a.riskAssessments[0].riskScore)
        .slice(0, 50);

      const rows: ReportRow[] = [];
      for (const asset of ranked) {
        const lcca = await getAssetLcca(organizationId, asset.id);
        if (!lcca || !lcca.bestLabel) continue;
        const best = lcca.options.find((o) => o.label === lcca.bestLabel)!;
        rows.push({
          assetCode: asset.assetCode,
          riskScore: asset.riskAssessments[0].riskScore,
          bestOption: lcca.bestLabel,
          bestNpv: best.totalNpv,
          doNothingNpv: lcca.doNothingNpv,
          savings: lcca.doNothingNpv != null ? lcca.doNothingNpv - best.totalNpv : null,
        });
      }
      return rows;
    },
  },
];

/** A report, its description and column headings in the organization's words. */
export function getReport(id: string, index: IndexWords, words: AssetWords): ReportDefinition | undefined {
  const report = REPORTS.find((r) => r.id === id);
  return report && inWords(report, index, words);
}

/** Every report, described in the organization's words. */
export function listReports(index: IndexWords, words: AssetWords): ReportDefinition[] {
  return REPORTS.map((r) => inWords(r, index, words));
}

function inWords(report: ReportDefinition, index: IndexWords, words: AssetWords): ReportDefinition {
  const say = (text: string) => withAssetWords(withIndex(text, index), words);
  return { ...report, description: say(report.description), columns: report.columns.map((c) => ({ ...c, label: say(c.label) })) };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** RFC 4180 escaping: quote anything containing a comma, quote or newline,
 * and double any embedded quotes. */
function escapeCsvCell(value: string | number | null): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(report: ReportDefinition, rows: ReportRow[]): string {
  const header = report.columns.map((c) => escapeCsvCell(c.label)).join(",");
  const body = rows.map((row) => report.columns.map((c) => escapeCsvCell(row[c.key] ?? null)).join(","));
  return [header, ...body].join("\r\n");
}

export function reportFileName(report: ReportDefinition): string {
  const date = new Date().toISOString().slice(0, 10);
  return `carnac-${report.id}-${date}.csv`;
}
