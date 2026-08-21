import Link from "next/link";
import { auth } from "@/lib/auth";
import { getNetworkRecommendations, listTreatments } from "@/server/treatments";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { formatCurrency, formatNumber } from "@/lib/format";
import { getConditionBand } from "@/domain/waterline/condition";
import { getRiskBand } from "@/domain/waterline/risk";
import { CheckCircle2, DollarSign, Hammer, Wrench } from "lucide-react";
import { ASSET_LABEL } from "@/config/labels";
import { getConditionBands } from "@/server/settings";
import { getPageName } from "@/server/navigation";

const CATEGORY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Assess: "secondary",
  Repair: "outline",
  Rehabilitate: "default",
  Renew: "destructive",
  Retire: "secondary",
};

export default async function TreatmentPlanningPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/treatment-planning", "Treatment Planning");
  const conditionBands = await getConditionBands(organizationId);

  const [recommendations, library] = await Promise.all([
    getNetworkRecommendations(organizationId),
    listTreatments(organizationId),
  ]);

  const renewalCount = recommendations.rows.filter((r) => r.category === "Renew").length;
  const topRows = recommendations.rows.slice(0, 25);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Applicable treatments, effects and cost for every segment — each recommendation carries its reasoning"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Identified Need"
          value={formatCurrency(recommendations.totalEstimatedCost, { compact: true })}
          sublabel="Sum of recommended treatments"
          icon={DollarSign}
        />
        <KpiCard
          label="Segments Needing Work"
          value={formatNumber(recommendations.rows.length)}
          sublabel="Have a recommended treatment"
          icon={Wrench}
        />
        <KpiCard
          label="Renewal Candidates"
          value={formatNumber(renewalCount)}
          sublabel="Replacement or upsizing"
          icon={Hammer}
          tone={renewalCount > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="No Action Needed"
          value={formatNumber(recommendations.noActionCount)}
          sublabel="Condition does not warrant work"
          icon={CheckCircle2}
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Treatment Mix — Estimated Spend by Treatment</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart
            data={recommendations.byTreatment.map((t) => ({ treatment: t.treatment, cost: Math.round(t.cost) }))}
            xKey="treatment"
            yKey="cost"
            valueFormat="currency-compact"
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recommended Treatments — Highest Risk First</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ASSET_LABEL.singular}</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Recommended Treatment</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Estimated Cost</TableHead>
                <TableHead>Risk Reduction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    No treatments recommended.
                  </TableCell>
                </TableRow>
              )}
              {topRows.map((row) => {
                const conditionBand = row.conditionScore != null ? getConditionBand(row.conditionScore, conditionBands) : null;
                const riskBand = row.riskScore != null ? getRiskBand(row.riskScore) : null;
                return (
                  <TableRow key={row.assetId}>
                    <TableCell>
                      <Link
                        href={`/assets/${row.assetId}?tab=treatments`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.assetCode}
                      </Link>
                    </TableCell>
                    <TableCell style={conditionBand ? { color: conditionBand.color } : undefined}>
                      {row.conditionScore != null ? `${row.conditionScore} · ${conditionBand?.label}` : "Not inspected"}
                    </TableCell>
                    <TableCell style={riskBand ? { color: riskBand.color } : undefined}>
                      {row.riskScore != null ? `${row.riskScore} · ${riskBand?.label}` : "—"}
                    </TableCell>
                    <TableCell className="font-medium">{row.treatment}</TableCell>
                    <TableCell>
                      <Badge variant={CATEGORY_VARIANT[row.category] ?? "default"}>{row.category}</Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(row.estimatedCost)}</TableCell>
                    <TableCell>{row.riskReductionPct != null ? `${row.riskReductionPct}%` : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {recommendations.rows.length > topRows.length && (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              Showing the {topRows.length} highest-risk of {formatNumber(recommendations.rows.length)} segments with a
              recommended treatment. Budget-constrained prioritization across the full list arrives with Scenario
              Planning (Phase 6) and the Work Plan (Phase 7).
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Treatment Library</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Treatment</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Condition Range</TableHead>
                <TableHead>Materials</TableHead>
                <TableHead>Unit Cost</TableHead>
                <TableHead>Mobilization</TableHead>
                <TableHead>Life Extension</TableHead>
                <TableHead>Failure Prob. ×</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {library.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                    {t.constraints && <div className="mt-0.5 text-xs italic text-muted-foreground">{t.constraints}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={CATEGORY_VARIANT[t.category] ?? "default"}>{t.category}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{t.conditionRange}</TableCell>
                  <TableCell className="text-xs">{t.materials}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatCurrency(t.unitCost)} {t.costUnit}
                  </TableCell>
                  <TableCell>{formatCurrency(t.mobilizationCost)}</TableCell>
                  <TableCell>{t.expectedLifeExtension > 0 ? `${t.expectedLifeExtension} yr` : "—"}</TableCell>
                  <TableCell>{t.failureProbMultiplier}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Costs scale with diameter (normalized so 8&quot; = 1.0) and, for per-linear-foot treatments, with segment
        length. Estimates here are initial construction cost only — life-cycle cost including maintenance, failure
        and residual value arrives in Phase 6.
      </p>
    </div>
  );
}
