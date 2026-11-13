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

import { PrintReportButton } from "./print-report-button";
import { PrintForecast } from "./print-forecast";
import "./print.css";

const number = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });

export default async function ScenarioRunReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user: { organizationId } } = await requireSession();
  const query = await searchParams;
  const requested = query.scenario;
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
  const years = [...new Set(projects.map((project) => String(project.year)))].sort();
  const treatments = [...new Set(projects.map((project) => project.name))].sort();
  const year = typeof query.year === "string" && years.includes(query.year) ? query.year : "";
  const treatment = typeof query.treatment === "string" && treatments.includes(query.treatment) ? query.treatment : "";
  const funding = query.funding === "selected" || query.funding === "locked" ? query.funding : "";
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const scoreText = typeof query.minScore === "string" ? query.minScore.trim() : "";
  const minScore = scoreText !== "" && Number.isFinite(Number(scoreText)) && Number(scoreText) >= 0
    ? Number(scoreText) : null;
  const filteredProjects = projects.filter((project) =>
    (!year || String(project.year) === year) &&
    (!treatment || project.name === treatment) &&
    (!funding || project.locked === (funding === "locked")) &&
    (!search || `${project.assetCode} ${project.name} ${project.reason ?? ""}`.toLowerCase().includes(search.toLowerCase())) &&
    (minScore === null || (!project.locked && project.ranking?.score != null && project.ranking.score >= minScore))
  );
  const filterSummary = [
    year && `Paid in ${year}`,
    treatment,
    funding === "locked" ? "Locked projects" : funding === "selected" ? "Selected projects" : "",
    search && `Search “${search}”`,
    minScore !== null && `Priority Score at least ${minScore}`,
  ].filter(Boolean).join(" · ");
  const selectedProjects = filteredProjects.filter((project) => !project.locked);
  const ranked = selectedProjects.filter((project) => project.ranking?.score != null);
  const topProjects = (ranked.length > 0 ? ranked : [...selectedProjects].sort((a, b) => b.cost - a.cost)).slice(0, 5);

  return (
    <div className="scenario-run-report space-y-4">
      <PageHeader
        title="Scenario Run Summary"
        description="Review the latest saved run for a scenario, including its forecast and funded program."
        actions={<div className="report-controls flex flex-wrap items-center gap-3">
          <Link href="/reports" className="text-sm text-primary hover:underline">All reports</Link>
          {scenario && first && last && <PrintReportButton />}
        </div>}
      />
      {choices.length > 0 && (
        <form action="/reports/scenario-run" method="get" className="report-controls flex flex-wrap items-end gap-3">
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
              <span className="report-controls"> · </span>
              <Link href={`/scenario-planning/${scenario.id}`} className="report-controls text-primary hover:underline">Open scenario</Link>
            </p>
          </div>
          <p className="text-sm text-muted-foreground">Summary totals and forecasts cover the whole scenario run. Project filters apply to the project lists below.</p>
          <dl className="report-kpis grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
          <div className="report-forecasts grid gap-4 lg:grid-cols-2">
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
            <CardHeader><CardTitle>Projects included in this report</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <form key={JSON.stringify([scenario.id, year, treatment, funding, search, minScore])}
                action="/reports/scenario-run" method="get" className="report-controls flex flex-wrap items-end gap-3">
                <input type="hidden" name="scenario" value={scenario.id} />
                <ProjectFilter label="Paid year" name="year" value={year} options={years} />
                <ProjectFilter label="Treatment / combination" name="treatment" value={treatment} options={treatments} />
                <label className="grid gap-1 text-sm font-medium">
                  Funding
                  <select name="funding" defaultValue={funding} className="h-9 rounded-md border bg-background px-3">
                    <option value="">All projects</option>
                    <option value="selected">Selected by run</option>
                    <option value="locked">Locked from plan</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Search projects
                  <input name="search" defaultValue={search} placeholder="Asset, project or reason" className="h-9 rounded-md border bg-background px-3" />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Minimum Priority Score
                  <input name="minScore" type="number" min="0" step="any" defaultValue={minScore ?? ""} className="h-9 w-40 rounded-md border bg-background px-3" />
                </label>
                <Button type="submit">Apply filters</Button>
                <Link href={`/reports/scenario-run?scenario=${scenario.id}`} className="text-sm text-primary hover:underline">Reset filters</Link>
              </form>
              <p className="text-sm">
                Showing {formatNumber(filteredProjects.length)} of {formatNumber(projects.length)} projects
                {" · "}Included project cost {formatCurrency(filteredProjects.reduce((sum, project) => sum + project.cost, 0))}
              </p>
              <p className="text-sm text-muted-foreground">{filterSummary || "All funded projects included."}</p>
              {minScore !== null && <p className="text-sm text-muted-foreground">The minimum score includes projects with a saved ranking score. Locked projects and projects with unavailable scores are excluded.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top selected projects</CardTitle>
              <p className="text-sm text-muted-foreground">
                {ranked.length > 0
                  ? "Up to five matching projects ranked by saved Priority Score."
                  : "Up to five matching projects by cost when saved scores are unavailable."}
                {" "}The run allocates funding based on what each option adds over a cheaper choice, within its funding and delivery rules.
              </p>
            </CardHeader>
            <CardContent>
              {topProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No selected projects match the project filters.</p>
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
          <Card className="report-projects">
            <CardHeader>
              <CardTitle>Funded projects included in report</CardTitle>
              <p className="text-sm text-muted-foreground">
                Priority Score = criticality × scale × category weight × asset type weight × expected benefit ÷ scoring cost.
                {" "}Locked work enters the program through the locked plan. Older runs can show saved projects but require a new run to capture scores.
              </p>
              <Link href={`/scenario-planning/${scenario.id}/alternatives`} className="report-controls text-sm text-primary hover:underline">
                Explore funded and unfunded alternatives using current settings
              </Link>
            </CardHeader>
            <CardContent>
              {filteredProjects.length === 0 ? <p className="text-sm text-muted-foreground">No projects match the project filters.</p> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {["Asset", "Project", "Programmed / Paid / Built", "Cost", "Priority Score", "Score factors", "Selection reason"].map((label) => (
                        <TableHead key={label}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProjects.map((project) => {
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
        <PrintForecast title={title} data={data} series={series} domain={domain} />
        <div className="report-screen-chart"><SimpleLineChart data={data} xKey="year" series={series.map((line) => ({ ...line, showDots: data.length === 1 }))} yDomain={domain} /></div>
      </CardContent>
    </Card>
  );
}

function ProjectFilter({ label, name, value, options }: {
  label: string;
  name: string;
  value: string;
  options: string[];
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select name={name} defaultValue={value} className="h-9 max-w-72 rounded-md border bg-background px-3">
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}
