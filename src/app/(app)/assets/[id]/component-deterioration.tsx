import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimpleLineChart } from "@/components/charts/simple-line-chart";
import type { AssetComponentForecast } from "@/server/component-deterioration";

/** The asset's own line first, then a colour per component. */
const COMPONENT_COLORS = [
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "#0ea5e9",
  "#a855f7",
  "#f59e0b",
];

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "danger" }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${tone === "danger" ? "text-destructive" : ""}`}>{value}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

function yearsTo(value: number | null, otherwise: string) {
  if (value == null) return otherwise;
  if (value === 0) return "Now";
  return `~${value} yr`;
}

/**
 * A facility's "do nothing" forecast: each component on its own curve from
 * where its last inspection left it, and the asset's condition rolled up from
 * them year by year — so the asset line bends where a part it can't do
 * without wears out, not on an average age.
 */
export function ComponentDeterioration({ forecast }: { forecast: AssetComponentForecast }) {
  const { startYear, horizon, threshold, components, asset } = forecast;
  const at = (offset: number) => asset[offset]?.condition ?? null;

  const data = asset.map((p, i) => ({
    year: p.year,
    asset: p.condition,
    ...Object.fromEntries(components.map((c) => [c.id, c.points[i]?.condition ?? null])),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label={`Forecast for ${startYear}`}
          value={at(0) != null ? String(at(0)) : "—"}
          note={
            forecast.inspectedScore != null
              ? `${forecast.inspectedScore} as last inspected, aged to ${startYear}`
              : undefined
          }
        />
        <Stat label={`Forecast for ${startYear + 5}`} value={at(5) != null ? String(at(5)) : "—"} />
        <Stat label={`Forecast for ${startYear + horizon}`} value={at(horizon) != null ? String(at(horizon)) : "—"} />
        <Stat
          label={`Asset reaches ${threshold}`}
          value={yearsTo(forecast.assetRemainingLife, `Not within ${horizon} yr`)}
          tone={forecast.assetRemainingLife != null && forecast.assetRemainingLife <= 5 ? "danger" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Component Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleLineChart
            data={data}
            xKey="year"
            yDomain={[0, 100]}
            height={300}
            referenceY={threshold}
            referenceLabel="Intervention threshold"
            series={[
              { key: "asset", label: "Asset (rolled up)", color: "var(--color-chart-1)" },
              ...components.map((c, i) => ({
                key: c.id,
                label: c.label,
                color: COMPONENT_COLORS[i % COMPONENT_COLORS.length],
                dashed: true,
              })),
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            No intervention, from {startYear}. Each component follows its own curve from its last inspection, aged by
            the years since. The asset line is rolled up from them each year under{" "}
            {forecast.strategyName ?? "the roll-up strategy"} — the strategy that scores it today.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Curve</TableHead>
                  <TableHead>Starts from</TableHead>
                  <TableHead className="text-right">{startYear}</TableHead>
                  <TableHead className="text-right">{startYear + 5}</TableHead>
                  <TableHead className="text-right">{startYear + horizon}</TableHead>
                  <TableHead>Reaches {threshold}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.label}</TableCell>
                    <TableCell className="text-sm">
                      {c.curve.serviceLife} yr · shape {c.curve.shape}
                      {c.defaultCurve && <span className="block text-xs text-muted-foreground">typical — its curve is off</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.basis}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.points[0]?.condition ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.points[5]?.condition ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.points[horizon]?.condition ?? "—"}</TableCell>
                    <TableCell
                      className={`text-sm ${c.remainingLife != null && c.remainingLife <= 5 ? "font-medium text-destructive" : ""}`}
                    >
                      {yearsTo(c.remainingLife, "Not on this curve")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {forecast.unforecast.length > 0 &&
          `Not forecast: ${forecast.unforecast.join(", ")} — never inspected and no install date to go on. `}
        Curves are set per component under{" "}
        <Link href="/settings/deterioration-models" className="text-primary hover:underline">
          Settings › Deterioration Models
        </Link>
        .
      </p>
    </div>
  );
}
