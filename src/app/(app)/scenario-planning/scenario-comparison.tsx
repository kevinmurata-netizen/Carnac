"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ScenarioSummary } from "@/server/scenarios";
import { getConditionBand, type ConditionBand } from "@/domain/waterline/condition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimpleLineChart, type LineSeries } from "@/components/charts/simple-line-chart";
import { formatCurrency, formatNumber } from "@/lib/format";

/** Colors are assigned by position in the full list, not by position among the
 * checked ones, so a scenario keeps the same line color as others are toggled. */
const SERIES_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function ScenarioComparison({
  scenarios,
  bands,
}: {
  scenarios: ScenarioSummary[];
  /** Configured bands, passed from the server page — a client component cannot
   * read them itself, and the seeded defaults would ignore any edit. */
  bands: ConditionBand[];
}) {
  const runnable = useMemo(() => scenarios.filter((s) => s.conditionSeries.length > 0), [scenarios]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(runnable.map((s) => s.id)));

  const colorById = useMemo(
    () => new Map(scenarios.map((s, i) => [s.id, SERIES_COLORS[i % SERIES_COLORS.length]])),
    [scenarios]
  );
  const colorFor = (id: string) => colorById.get(id) ?? SERIES_COLORS[0];

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selected = useMemo(() => runnable.filter((s) => checked.has(s.id)), [runnable, checked]);
  const allChecked = runnable.length > 0 && selected.length === runnable.length;

  const { rows, series } = useMemo(() => {
    const years = [...new Set(selected.flatMap((s) => s.conditionSeries.map((p) => p.year)))].sort((a, b) => a - b);
    const lookup = new Map(
      selected.map((s) => [s.id, new Map(s.conditionSeries.map((p) => [p.year, p.avgCondition]))])
    );

    const rows = years.map((year) => {
      const row: Record<string, string | number | null> = { year };
      for (const s of selected) row[s.id] = lookup.get(s.id)!.get(year) ?? null;
      return row;
    });

    const series: LineSeries[] = selected.map((s) => ({
      key: s.id,
      label: s.name,
      color: colorById.get(s.id) ?? SERIES_COLORS[0],
      // A series with one point draws no visible line, and short runs read
      // better with markers on each year.
      showDots: s.conditionSeries.length <= 1 || years.length <= 12,
    }));

    return { rows, series };
  }, [selected, colorById]);

  // Only draw the target line when every checked scenario shares it — otherwise
  // a single line would imply agreement that isn't there.
  const targets = new Set(selected.map((s) => s.assumptions.conditionTarget));
  const sharedTarget = targets.size === 1 ? [...targets][0] : null;

  const finals = selected
    .map((s) => ({ name: s.name, value: s.conditionSeries.at(-1)!.avgCondition }))
    .sort((a, b) => b.value - a.value);
  const spread = finals.length > 1 ? Math.round((finals[0].value - finals.at(-1)!.value) * 10) / 10 : null;

  return (
    <>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>
            Average Condition by Year{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({selected.length} of {runnable.length} scenarios)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selected.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              Check one or more scenarios below to plot them.
            </div>
          ) : (
            <>
              <SimpleLineChart
                data={rows}
                xKey="year"
                series={series}
                height={300}
                yDomain={[0, 100]}
                referenceY={sharedTarget ?? undefined}
                referenceLabel={sharedTarget != null ? `Target ${sharedTarget}` : undefined}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {spread != null ? (
                  <>
                    By {rows.at(-1)?.year}, <span className="font-medium">{finals[0].name}</span> ends highest at{" "}
                    {finals[0].value} WCI and{" "}
                    <span className="font-medium">{finals.at(-1)!.name}</span> lowest at {finals.at(-1)!.value} — a
                    spread of {spread} points.
                  </>
                ) : (
                  <>
                    {finals[0].name} ends at {finals[0].value} WCI. Check another scenario to compare against it.
                  </>
                )}
                {sharedTarget == null && selected.length > 1 && (
                  <> Condition targets differ between these scenarios, so no target line is shown.</>
                )}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Scenario Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary align-middle"
                      aria-label="Plot all scenarios"
                      checked={allChecked}
                      disabled={runnable.length === 0}
                      onChange={() => setChecked(allChecked ? new Set() : new Set(runnable.map((s) => s.id)))}
                    />
                  </TableHead>
                  <TableHead>Scenario</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Annual Budget</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Final Condition</TableHead>
                  <TableHead>Expected Failures</TableHead>
                  <TableHead>Backlog at End</TableHead>
                  <TableHead>Total Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarios.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                      No scenarios yet — create one below.
                    </TableCell>
                  </TableRow>
                )}
                {scenarios.map((s) => {
                  const band = s.finalAvgCondition != null ? getConditionBand(s.finalAvgCondition, bands) : null;
                  const plottable = s.conditionSeries.length > 0;
                  const isChecked = checked.has(s.id);
                  return (
                    <TableRow key={s.id} className={isChecked ? "bg-muted/40" : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            aria-label={`Plot ${s.name}`}
                            checked={isChecked}
                            disabled={!plottable}
                            onChange={() => toggle(s.id)}
                          />
                          <span
                            className="h-3 w-1 rounded-full"
                            style={{
                              backgroundColor: isChecked ? colorFor(s.id) : "transparent",
                            }}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/scenario-planning/${s.id}`} className="font-medium text-primary hover:underline">
                          {s.name}
                        </Link>
                        {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                        {!plottable && <div className="text-xs text-muted-foreground">Not run yet</div>}
                      </TableCell>
                      <TableCell className="text-xs">{s.assumptions.strategy}</TableCell>
                      <TableCell>{formatCurrency(s.assumptions.annualBudget, { compact: true })}</TableCell>
                      <TableCell>{s.assumptions.analysisPeriodYears} yr</TableCell>
                      <TableCell style={band ? { color: band.color } : undefined} className="font-medium">
                        {s.finalAvgCondition ?? "—"}
                      </TableCell>
                      <TableCell>{s.totalFailures != null ? formatNumber(s.totalFailures) : "—"}</TableCell>
                      <TableCell>
                        {s.finalBacklog != null ? formatCurrency(s.finalBacklog, { compact: true }) : "—"}
                      </TableCell>
                      <TableCell>{s.totalSpend != null ? formatCurrency(s.totalSpend, { compact: true }) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
