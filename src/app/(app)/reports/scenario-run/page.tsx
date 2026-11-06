import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { SimpleLineChart, type LineSeries } from "@/components/charts/simple-line-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { getScenarioIndexWords } from "@/server/condition-model";
import { requireSession } from "@/server/guard";
import { getScenarioReportProjects } from "@/server/scenario-report";
import { getScenario, listScenarios } from "@/server/scenarios";

const number = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });

export default async function ScenarioRunReport({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string | string[] }>;
}) {
  const { user: { organizationId } } = await requireSession();
  const { scenario: requested } = await searchParams;
  const choices = (await listScenarios(organizationId))
    .filter((scenario) => scenario.hasResults)
    .sort((a, b) => (b.lastRunAt?.getTime() ?? 0) - (a.lastRunAt?.getTime() ?? 0));
  const selected = requested === undefined ? choices[0] : choices.find((choice) => choice.id === requested);
  const unavailable = requested !== undefined && !selected;

  const [scenario, projects, index] = selected
    ? await Promise.all([
        getScenario(organizationId, selected.id),
        getScenarioReportProjects(organizationId, selected.id),
        getScenarioIndexWords(organizationId, selected.id),
      ])
    : [null, [], null] as const;
  const first = scenario?.years[0];
  const last = scenario?.years.at(-1);
  const chartData = scenario?.years.map(({ year, spend, budget, avgCondition, backlog, expectedFailures }) => ({
    year, spend, budget, avgCondition, backlog, expectedFailures,
  })) ?? [];
  const selectedProjects = projects.filter((project) => !project.locked);
  const ranked = selectedProjects.filter((project) => project.ranking?.score != null);
  const topProjects = (ranked.length > 0 ? ranked : [...selectedProjects].sort((a, b) => b.cost - a.cost)).slice(0, 5);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Scenario Run Summary"
        description="Review the latest saved run for a scenario, including its forecast and funded program."
        actions={<Link href="/reports" className="text-sm text-primary hover:underline">All reports</Link>}
      />
      {choices.length > 0 && (
        <form action="/reports/scenario-run" method="get" className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Scenario
            <select name="scenario" defaultValue={selected?.id} className="h-9 max-w-full rounded-md border bg-background px-3">
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}{choice.lastRunAt && ` · ${formatDateTime(choice.lastRunAt)}`}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">View run</Button>
        </form>
      )}
      {scenario && first && last && index ? (
        <>
          <div>
            <h2 className="text-xl font-semibold">{scenario.name}</h2>
            <p className="text-sm text-muted-foreground">
              {first.year}–{last.year}
              {scenario.lastRunAt && ` · Saved ${formatDateTime(scenario.lastRunAt)}`}
              {" · "}
              <Link href={`/scenario-planning/${scenario.id}`} className="text-primary hover:underline">Open scenario</Link>
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Total spend", formatCurrency(scenario.totalSpend ?? 0)],
              ["Funded projects", formatNumber(projects.length)],
              [`Final ${index.short}`, number.format(last.avgCondition)],
              ["Final deferred backlog", formatCurrency(last.backlog)],
              ["Total expected failures", number.format(scenario.totalFailures ?? 0)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border bg-card p-4">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-4 lg:grid-cols-2">
            <Forecast title="Annual spending" data={chartData} series={[
              { key: "spend", label: "Spend", color: "var(--color-chart-1)" },
              ...(!scenario.target ? [{ key: "budget", label: "Budget", color: "var(--color-chart-3)", dashed: true }] : []),
            ]} />
            <Forecast title="Network condition" data={chartData} series={[
              { key: "avgCondition", label: index.short, color: "var(--color-chart-2)" },
            ]} domain={[0, 100]} />
            <Forecast title="Deferred backlog" data={chartData} series={[
              { key: "backlog", label: "Unfunded work", color: "var(--color-chart-5)" },
            ]} />
            <Forecast title="Expected failures per year" data={chartData} series={[
              { key: "expectedFailures", label: "Expected failures", color: "var(--color-chart-4)" },
            ]} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Top selected projects</CardTitle>
              <p className="text-sm text-muted-foreground">
                {ranked.length > 0
                  ? "Up to five projects ranked by saved Priority Score."
                  : "Up to five projects by cost when saved scores are unavailable."}
                {" "}The run allocates funding based on what each option adds over a cheaper choice, within its funding and delivery rules.
              </p>
            </CardHeader>
            <CardContent>
              {topProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">This run has no projects selected through ranking.</p>
              ) : (
                <ol className="divide-y">
                  {topProjects.map((project) => (
                    <li key={project.id} className="space-y-1 py-3">
                      <div className="font-medium">{project.assetCode} · {project.name} · {formatCurrency(project.cost)}{project.ranking?.score != null && ` · Score ${project.ranking.score}`}</div>
                      <p className="text-sm">{project.reason}</p>
                      {project.ranking?.incremental != null && (
                        <p className="text-sm text-muted-foreground">
                          Incremental score {number.format(project.ranking.incremental)} over {project.ranking.incrementalOver ?? "doing nothing"}.
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Full funded program</CardTitle>
              <p className="text-sm text-muted-foreground">
                Priority Score = criticality × scale × category weight × asset type weight × expected benefit ÷ scoring cost.
                {" "}Locked work enters the program through the locked plan. Older runs can show saved projects but require a new run to capture scores.
              </p>
              <Link href={`/scenario-planning/${scenario.id}/alternatives`} className="text-sm text-primary hover:underline">
                Explore funded and unfunded alternatives using current settings
              </Link>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? <p className="text-sm text-muted-foreground">No funded projects were saved for this run.</p> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Asset", "Project", "Programmed / Paid / Built", "Cost", "Priority Score", "Score factors", "Selection reason"].map((label) => (
                        <TableHead key={label}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => {
                      const terms = project.ranking?.terms;
                      return (
                        <TableRow key={project.id}>
                          <TableCell>{project.assetCode}</TableCell>
                          <TableCell>{project.name}</TableCell>
                          <TableCell>{project.programmedYear} / {project.year} / {project.buildYear}</TableCell>
                          <TableCell>{formatCurrency(project.cost)}</TableCell>
                          <TableCell>{project.locked ? "Locked" : project.ranking?.score ?? "Unavailable"}</TableCell>
                          <TableCell className="min-w-52 whitespace-normal text-xs">
                            {terms && !project.locked && (
                              <>Criticality {number.format(terms.criticality)} · Scale {number.format(terms.scaleFactor)} · Category weight {number.format(terms.categoryWeight)} · Asset type weight {number.format(terms.assetTypeWeight ?? 1)} · Benefit {number.format(terms.benefit)} · Scoring cost {formatCurrency(terms.totalCost)}</>
                            )}
                          </TableCell>
                          <TableCell className="min-w-64 whitespace-normal text-xs">{project.reason ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        unavailable ? <p className="text-sm text-muted-foreground">The requested saved run is unavailable. Choose a scenario with saved results.</p> : <p className="text-sm text-muted-foreground">Run a scenario in <Link href="/scenario-planning" className="text-primary hover:underline">Scenario Planning</Link> to view its results here.</p>
      )}
    </div>
  );
}

function Forecast({ title, data, series, domain }: {
  title: string;
  data: Parameters<typeof SimpleLineChart>[0]["data"];
  series: LineSeries[];
  domain?: [number, number];
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <SimpleLineChart data={data} xKey="year" series={series.map((line) => ({ ...line, showDots: data.length === 1 }))} yDomain={domain} />
      </CardContent>
    </Card>
  );
}
