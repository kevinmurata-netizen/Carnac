import { auth } from "@/lib/auth";
import {
  getNetworkForecast,
  listDeteriorationModels,
  getMaterialCurveSeries,
} from "@/server/deterioration";
import { getConditionSummary } from "@/server/condition";
import { NETWORK_CONDITION_TARGET, MATERIAL_CURVES } from "@/domain/waterline/deterioration";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimpleLineChart } from "@/components/charts/simple-line-chart";
import { formatNumber } from "@/lib/format";
import { Gauge, LineChart, Target, TrendingDown } from "lucide-react";
import { ASSET_LABEL } from "@/config/labels";
import { getPageName } from "@/server/navigation";

const MATERIAL_COLORS: Record<string, string> = {
  PVC: "#2563eb",
  HDPE: "#0891b2",
  "Ductile Iron": "#16a34a",
  Copper: "#a16207",
  Steel: "#7c3aed",
  "Cast Iron": "#ea580c",
  "Asbestos Cement": "#dc2626",
};

export default async function DeteriorationModelsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/deterioration-models", "Deterioration Models");

  const [forecast, models, condition] = await Promise.all([
    getNetworkForecast(organizationId),
    listDeteriorationModels(organizationId),
    getConditionSummary(organizationId),
  ]);

  const markovByYear = new Map(forecast.markov.map((p) => [p.year, p.avgCondition]));
  const forecastData = forecast.curve.map((p) => ({
    year: p.year,
    curve: p.avgCondition,
    markov: markovByYear.get(p.year) ?? null,
  }));

  const current = forecast.curve[0]?.avgCondition ?? condition.averageScore ?? null;
  const in5 = forecast.curve.find((p) => p.year === forecast.startYear + 5)?.avgCondition ?? null;
  const in10 = forecast.curve.find((p) => p.year === forecast.startYear + 10)?.avgCondition ?? null;

  const curveSeries = getMaterialCurveSeries();

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Curve-based and Markov state-transition forecasting — the 'do nothing' trajectory"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Network WCI Today"
          value={current != null ? String(current) : "—"}
          sublabel={`Forecast baseline (inspected ${ASSET_LABEL.lowerPlural})`}
          icon={Gauge}
        />
        <KpiCard
          label="Forecast in 5 Years"
          value={in5 != null ? String(in5) : "—"}
          sublabel={current != null && in5 != null ? `${(in5 - current).toFixed(1)} vs today` : undefined}
          icon={TrendingDown}
          tone="warning"
        />
        <KpiCard
          label="Forecast in 10 Years"
          value={in10 != null ? String(in10) : "—"}
          sublabel={current != null && in10 != null ? `${(in10 - current).toFixed(1)} vs today` : undefined}
          icon={TrendingDown}
          tone="danger"
        />
        <KpiCard
          label="Condition Target"
          value={String(NETWORK_CONDITION_TARGET)}
          sublabel={
            current != null
              ? current >= NETWORK_CONDITION_TARGET
                ? "Network at target"
                : `${(NETWORK_CONDITION_TARGET - current).toFixed(1)} below target today`
              : undefined
          }
          icon={Target}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Network Condition Forecast — Model Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleLineChart
              data={forecastData}
              xKey="year"
              yDomain={[0, 100]}
              referenceY={NETWORK_CONDITION_TARGET}
              referenceLabel={`Target ${NETWORK_CONDITION_TARGET}`}
              series={[
                { key: "curve", label: "Curve models (per material)", color: "var(--color-chart-1)" },
                { key: "markov", label: "Markov state-transition", color: "var(--color-chart-4)", dashed: true },
              ]}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Average WCI across inspected active segments with no intervention. Two independent model families
              forecasting the same network — divergence indicates model uncertainty worth calibrating.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deterioration Curves by Material</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleLineChart
              data={curveSeries}
              xKey="age"
              yDomain={[0, 100]}
              series={Object.keys(MATERIAL_CURVES).map((material) => ({
                key: material,
                label: material,
                color: MATERIAL_COLORS[material] ?? "var(--color-chart-1)",
              }))}
            />
            <p className="mt-2 text-xs text-muted-foreground">WCI vs. age in years for a new pipe of each material.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Configured Models</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Applies To</TableHead>
                <TableHead>Parameters</TableHead>
                <TableHead>Predictions</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.modelType}</TableCell>
                  <TableCell>{String(m.applicability.material ?? "—")}</TableCell>
                  <TableCell className="max-w-md text-xs text-muted-foreground">
                    {m.modelType === "MARKOV"
                      ? "5-state annual transition matrix"
                      : Object.entries(m.parameters)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                  </TableCell>
                  <TableCell>{formatNumber(m.predictionCount)}</TableCell>
                  <TableCell>
                    <Badge variant={m.isActive ? "default" : "secondary"}>{m.isActive ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        <LineChart className="mr-1 inline h-3.5 w-3.5" />
        Individual {ASSET_LABEL.lower} forecasts are anchored to the {ASSET_LABEL.lower}&apos;s latest observed condition — a pipe measuring worse
        than its age suggests follows the curve from where it actually is, not where the calendar says it should be.
      </p>
    </div>
  );
}
