import Link from "next/link";
import { auth } from "@/lib/auth";
import { getConditionSummary, getWorstConditionAssets } from "@/server/condition";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConditionDistributionChart } from "@/components/charts/condition-distribution-chart";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { formatDate, formatNumber } from "@/lib/format";
import { Activity, Gauge, ShieldAlert, TrendingDown } from "lucide-react";
import { ASSET_LABEL } from "@/config/labels";
import { getConditionBands } from "@/server/settings";
import { getPageName } from "@/server/navigation";

export default async function ConditionPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/condition", "Condition");
  const conditionBands = await getConditionBands(organizationId);

  const [summary, worst] = await Promise.all([
    getConditionSummary(organizationId),
    getWorstConditionAssets(organizationId, 10),
  ]);

  const uninspected = summary.totalAssets - summary.inspectedAssets;
  const poorOrWorse = summary.byBand
    .filter((b) => b.label === "Poor" || b.label === "Very Poor")
    .reduce((sum, b) => sum + b.count, 0);
  const excellentOrGood = summary.byBand
    .filter((b) => b.label === "Excellent" || b.label === "Good")
    .reduce((sum, b) => sum + b.count, 0);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Waterline Condition Index (WCI) — network-wide condition derived from field inspections"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Network Condition Index"
          value={summary.averageScore != null ? String(summary.averageScore) : "—"}
          sublabel={`Based on ${formatNumber(summary.inspectedAssets)} inspected segments`}
          icon={Gauge}
        />
        <KpiCard
          label="Excellent / Good"
          value={summary.inspectedAssets ? `${Math.round((excellentOrGood / summary.inspectedAssets) * 100)}%` : "—"}
          sublabel={`${formatNumber(excellentOrGood)} segments`}
          icon={Activity}
        />
        <KpiCard
          label="Poor / Very Poor"
          value={summary.inspectedAssets ? `${Math.round((poorOrWorse / summary.inspectedAssets) * 100)}%` : "—"}
          sublabel={`${formatNumber(poorOrWorse)} segments need attention`}
          icon={TrendingDown}
          tone={poorOrWorse > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Not Yet Inspected"
          value={formatNumber(uninspected)}
          sublabel={`${summary.totalAssets ? Math.round((uninspected / summary.totalAssets) * 100) : 0}% of network`}
          icon={ShieldAlert}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Condition Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ConditionDistributionChart byBand={summary.byBand} bands={conditionBands} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average Condition by Material</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={summary.byMaterial.map((m) => ({ material: m.material, averageScore: m.averageScore }))}
              xKey="material"
              yKey="averageScore"
              color="var(--color-chart-2)"
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Lowest-Condition Segments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ASSET_LABEL.singular}</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Band</TableHead>
                <TableHead>Last Measured</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {worst.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    No condition measurements yet.
                  </TableCell>
                </TableRow>
              )}
              {worst.map((row) => (
                <TableRow key={row.asset.id}>
                  <TableCell>
                    <Link href={`/assets/${row.asset.id}`} className="font-medium text-primary hover:underline">
                      {row.asset.assetCode}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium" style={{ color: row.band.color }}>
                    {row.score}
                  </TableCell>
                  <TableCell>
                    <Badge style={{ backgroundColor: row.band.color, color: "white" }}>{row.band.label}</Badge>
                  </TableCell>
                  <TableCell>{formatDate(row.measurementDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
