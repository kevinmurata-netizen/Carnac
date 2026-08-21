import { auth } from "@/lib/auth";
import { getNetworkSummary } from "@/server/assets";
import { getNetworkGeoJSON } from "@/server/geo";
import { getConditionSummary } from "@/server/condition";
import { getRiskSummary } from "@/server/risk";
import { getNetworkForecast } from "@/server/deterioration";
import { getNetworkRecommendations } from "@/server/treatments";
import { getAnnualBudget } from "@/server/scenarios";
import { NETWORK_CONDITION_TARGET } from "@/domain/waterline/deterioration";
import { SimpleLineChart } from "@/components/charts/simple-line-chart";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NetworkMap } from "@/components/map/network-map";
import { StatusMapLegend } from "@/components/map/map-legend";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { ConditionDistributionChart } from "@/components/charts/condition-distribution-chart";
import { formatCurrency, formatFeetAsMiles, formatNumber, formatStatus } from "@/lib/format";
import { Droplets, Gauge, Layers, ShieldAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { ASSET_LABEL } from "@/config/labels";
import { getConditionBands } from "@/server/settings";
import { getPageName } from "@/server/navigation";

export default async function DashboardPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/dashboard", "Executive Dashboard");
  const conditionBands = await getConditionBands(organizationId);

  const [summary, geojson, condition, risk, forecast, treatments, annualBudget] = await Promise.all([
    getNetworkSummary(organizationId),
    getNetworkGeoJSON(organizationId),
    getConditionSummary(organizationId),
    getRiskSummary(organizationId),
    getNetworkForecast(organizationId),
    getNetworkRecommendations(organizationId),
    getAnnualBudget(organizationId),
  ]);

  const highRiskCount = risk.byBand
    .filter((b) => b.label === "High" || b.label === "Very High")
    .reduce((sum, b) => sum + b.count, 0);

  const materialChartData = summary.byMaterial.map((m) => ({ material: m.material, count: m.count }));
  const decadeChartData = summary.byDecade.map((d) => ({ decade: d.decade, count: d.count }));

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Waterline network overview — Meridian Falls Water Utility"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Waterline Network"
          value={formatFeetAsMiles(summary.totalLengthFt)}
          sublabel={`${formatNumber(summary.totalSegments)} segments`}
          icon={Droplets}
        />
        <KpiCard
          label="Identified Need"
          value={formatCurrency(treatments.totalEstimatedCost, { compact: true })}
          sublabel={`${formatNumber(treatments.rows.length)} segments need work`}
          icon={Gauge}
        />
        <KpiCard
          label={`High Risk ${ASSET_LABEL.plural}`}
          value={formatNumber(highRiskCount)}
          sublabel={`${risk.assessedAssets ? Math.round((highRiskCount / risk.assessedAssets) * 100) : 0}% of assessed network`}
          icon={Layers}
          tone={highRiskCount > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Network Condition Index"
          value={condition.averageScore != null ? String(condition.averageScore) : "—"}
          sublabel={
            condition.totalAssets
              ? `${Math.round((condition.inspectedAssets / condition.totalAssets) * 100)}% of network inspected`
              : "No inspections yet"
          }
          icon={ShieldAlert}
        />
        <KpiCard
          label="Annual Budget"
          value={annualBudget != null ? formatCurrency(annualBudget, { compact: true }) : "—"}
          sublabel="Available / year"
          icon={Wallet}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Network Map</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-[420px] overflow-hidden rounded-md border">
              <NetworkMap geojson={geojson} className="h-full w-full" />
              <StatusMapLegend />
            </div>
            <div className="mt-2 text-right">
              <Link href="/network" className="text-sm text-primary hover:underline">
                Open full network view →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Segments by Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.byStatus
              .sort((a, b) => b.count - a.count)
              .map((s) => (
                <div key={s.status} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{formatStatus(s.status)}</span>
                  <span className="font-medium">{formatNumber(s.count)}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Condition Forecast — No Intervention</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleLineChart
            data={forecast.curve.map((p) => ({ year: p.year, avgCondition: p.avgCondition }))}
            xKey="year"
            height={220}
            yDomain={[0, 100]}
            referenceY={NETWORK_CONDITION_TARGET}
            referenceLabel={`Target ${NETWORK_CONDITION_TARGET}`}
            series={[{ key: "avgCondition", label: "Network WCI", color: "var(--color-chart-1)" }]}
          />
        </CardContent>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Condition Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ConditionDistributionChart byBand={condition.byBand} bands={conditionBands} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Network by Material</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={materialChartData} xKey="material" yKey="count" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Installations by Decade</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={decadeChartData} xKey="decade" yKey="count" color="var(--color-chart-2)" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
