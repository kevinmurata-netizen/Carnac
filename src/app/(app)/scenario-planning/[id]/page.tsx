import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getScenario, getScenarioProjects, type ScenarioDetail } from "@/server/scenarios";
import { STRATEGIES, STRATEGY_DESCRIPTIONS, type Strategy } from "@/domain/waterline/scenario";
import { getConditionBand } from "@/domain/waterline/condition";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimpleLineChart } from "@/components/charts/simple-line-chart";
import { formatCurrency, formatNumber } from "@/lib/format";
import { ScenarioFields, toPercent } from "../scenario-fields";
import { rerunScenarioAction, updateScenarioAction, deleteScenarioAction } from "../actions";
import { AlertTriangle, Gauge, Layers, Wallet } from "lucide-react";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";
import { getConditionBands } from "@/server/settings";

export default async function ScenarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const conditionBands = await getConditionBands(organizationId);

  const [scenario, projects] = await Promise.all([
    getScenario(organizationId, id),
    getScenarioProjects(organizationId, id),
  ]);
  if (!scenario) notFound();

  const projectsByYear = new Map<number, typeof projects>();
  for (const p of projects) {
    const list = projectsByYear.get(p.year) ?? [];
    list.push(p);
    projectsByYear.set(p.year, list);
  }

  const canEdit = canRecordFieldData(session);
  const a = scenario.assumptions;
  const years = scenario.years;
  const first = years[0];
  const last = years[years.length - 1];
  const band = last ? getConditionBand(last.avgCondition, conditionBands) : null;
  const peak = years.length ? Math.max(...years.map((y) => y.avgCondition)) : null;
  const totalFailureCost = years.reduce((s, y) => s + y.failureCost, 0);

  return (
    <div>
      <SetBreadcrumb segment={id} label={scenario.name} />
      <PageHeader
        title={scenario.name}
        description={scenario.description ?? STRATEGY_DESCRIPTIONS[a.strategy as Strategy]}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <>
                <form action={rerunScenarioAction}>
                  <input type="hidden" name="scenarioId" value={scenario.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Re-run
                  </Button>
                </form>
                <form action={deleteScenarioAction}>
                  <input type="hidden" name="scenarioId" value={scenario.id} />
                  <Button type="submit" size="sm" variant="destructive">
                    Delete
                  </Button>
                </form>
              </>
            )}
          </div>
        }
      />

      {years.length === 0 ? (
        <>
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            This scenario has not been run yet. Adjust the parameters below and save to run it.
          </div>
          <AssumptionsCard scenario={scenario} canEdit={canEdit} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Final Condition"
              value={String(last.avgCondition)}
              sublabel={`${band?.label} · peaks at ${peak} in this run`}
              icon={Gauge}
            />
            <KpiCard
              label="Expected Failures"
              value={formatNumber(Math.round(years.reduce((s, y) => s + y.expectedFailures, 0)))}
              sublabel={`${formatCurrency(totalFailureCost, { compact: true })} in failure cost`}
              icon={AlertTriangle}
              tone="warning"
            />
            <KpiCard
              label="Backlog at End"
              value={formatCurrency(last.backlog, { compact: true })}
              sublabel={last.backlog === 0 ? "Fully funded" : "Unfunded identified work"}
              icon={Layers}
              tone={last.backlog > 0 ? "danger" : "default"}
            />
            <KpiCard
              label="Total Spend"
              value={formatCurrency(
                years.reduce((s, y) => s + y.spend, 0),
                { compact: true }
              )}
              sublabel={`Over ${a.analysisPeriodYears} years`}
              icon={Wallet}
            />
          </div>

          <AssumptionsCard scenario={scenario} canEdit={canEdit} />

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Condition Forecast vs Target</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleLineChart
                  data={years.map((y) => ({ year: y.year, avgCondition: y.avgCondition }))}
                  xKey="year"
                  yDomain={[0, 100]}
                  referenceY={a.conditionTarget}
                  referenceLabel={`Target ${a.conditionTarget}`}
                  series={[{ key: "avgCondition", label: "Network WCI", color: "var(--color-chart-1)" }]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Spending vs Budget</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleLineChart
                  data={years.map((y) => ({ year: y.year, budget: y.budget, spend: y.spend }))}
                  xKey="year"
                  series={[
                    { key: "budget", label: "Available budget", color: "var(--color-chart-3)", dashed: true },
                    { key: "spend", label: "Actual spend", color: "var(--color-chart-1)" },
                  ]}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Spend tracks budget while there is qualifying work. Once the renewable backlog clears, spending
                  falls below budget because the constraint becomes treatment applicability, not money.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Deferred Backlog</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleLineChart
                  data={years.map((y) => ({ year: y.year, backlog: y.backlog }))}
                  xKey="year"
                  series={[{ key: "backlog", label: "Unfunded work", color: "var(--color-chart-5)" }]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expected Failures per Year</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleLineChart
                  data={years.map((y) => ({ year: y.year, expectedFailures: y.expectedFailures }))}
                  xKey="year"
                  series={[{ key: "expectedFailures", label: "Expected failures", color: "var(--color-chart-4)" }]}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>
                Funded Projects{" "}
                <span className="text-muted-foreground">({formatNumber(projects.length)})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {projects.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  This run funded no work — either the budget was exhausted before anything qualified, or no
                  segment met the strategy&apos;s eligibility rule.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead>Asset</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Treatment</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Condition</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Risk Cut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...projectsByYear.entries()]
                        .sort(([a], [b]) => a - b)
                        .flatMap(([year, rows]) =>
                          rows.map((p, i) => (
                            <TableRow key={`${p.assetId}-${p.year}-${i}`}>
                              <TableCell className="whitespace-nowrap">
                                {i === 0 ? <span className="font-medium">{year}</span> : ""}
                              </TableCell>
                              <TableCell>
                                <Link
                                  href={`/assets/${p.assetId}?tab=treatments`}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {p.assetCode}
                                </Link>
                              </TableCell>
                              <TableCell className="text-xs">{p.serviceArea ?? "—"}</TableCell>
                              <TableCell>{p.treatment}</TableCell>
                              <TableCell>{formatCurrency(p.cost)}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                {p.conditionBefore} → {p.conditionAfter}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                {p.riskBefore} → {p.riskAfter}
                              </TableCell>
                              <TableCell>{p.riskReductionPct != null ? `${p.riskReductionPct}%` : "—"}</TableCell>
                            </TableRow>
                          ))
                        )}
                    </TableBody>
                  </Table>
                  <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                    These are the individual segments the run actually funded, in the order the strategy selected
                    them. They are also stored as a work plan linked to this scenario.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Year-by-Year Results</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Year</TableHead>
                      <TableHead>Budget</TableHead>
                      <TableHead>Spend</TableHead>
                      <TableHead>Segments Treated</TableHead>
                      <TableHead>Avg Condition</TableHead>
                      <TableHead>Avg Risk</TableHead>
                      <TableHead>Backlog</TableHead>
                      <TableHead>Expected Failures</TableHead>
                      <TableHead>Below Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {years.map((y) => (
                      <TableRow key={y.year}>
                        <TableCell className="font-medium">{y.year}</TableCell>
                        <TableCell>{formatCurrency(y.budget, { compact: true })}</TableCell>
                        <TableCell>{formatCurrency(y.spend, { compact: true })}</TableCell>
                        <TableCell>{formatNumber(y.treatedCount)}</TableCell>
                        <TableCell style={{ color: getConditionBand(y.avgCondition, conditionBands).color }}>{y.avgCondition}</TableCell>
                        <TableCell>{y.avgRisk}</TableCell>
                        <TableCell>{formatCurrency(y.backlog, { compact: true })}</TableCell>
                        <TableCell>{y.expectedFailures}</TableCell>
                        <TableCell>{formatNumber(y.belowTargetCount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <p className="mt-3 text-xs text-muted-foreground">
            Simulation starts from the current measured network ({formatNumber(first.belowTargetCount)} segments below
            the {a.conditionTarget} target in {first.year}). Each year the strategy ranks candidate work, funds down the
            list until the budget is exhausted, applies the treatment&apos;s stored effects, and ages the whole network
            one year along its material deterioration curve.
          </p>
        </>
      )}
    </div>
  );
}

/** Editable for anyone who can run scenarios, read-only otherwise. Rendered in
 * both the run and not-yet-run branches so an unrun scenario's parameters can
 * still be corrected before its first run. */
function AssumptionsCard({ scenario, canEdit }: { scenario: ScenarioDetail; canEdit: boolean }) {
  const a = scenario.assumptions;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Assumptions</CardTitle>
      </CardHeader>
      {canEdit ? (
        <CardContent>
          <form action={updateScenarioAction} className="space-y-4">
            <input type="hidden" name="scenarioId" value={scenario.id} />
            {/* Remount the fields whenever a save lands. React does not
                re-apply a changed defaultValue to already-mounted uncontrolled
                inputs, so without this the form keeps showing the pre-save
                values after the server action revalidates — and saving again
                would silently write those stale values back. */}
            <ScenarioFields
              key={scenario.updatedAt.toISOString()}
              idPrefix="edit-"
              defaults={{
                name: scenario.name,
                description: scenario.description ?? "",
                annualBudget: a.annualBudget,
                fundingGrowthPct: toPercent(a.fundingGrowth),
                discountRatePct: toPercent(a.discountRate),
                analysisPeriodYears: a.analysisPeriodYears,
                conditionTarget: a.conditionTarget,
                riskThreshold: a.riskThreshold,
                strategy: a.strategy,
              }}
            />
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="mb-1 font-medium text-foreground">Strategies</div>
              <ul className="space-y-0.5">
                {STRATEGIES.map((s) => (
                  <li key={s}>
                    <span className="font-medium">{s}</span> — {STRATEGY_DESCRIPTIONS[s]}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                Saving re-runs the simulation immediately — results and the funded project list are replaced, so what
                you see always matches these parameters.
              </p>
              <Button type="submit" className="shrink-0">
                Save &amp; Re-run
              </Button>
            </div>
          </form>
        </CardContent>
      ) : (
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
          <Field label="Strategy" value={a.strategy} />
          <Field label="Annual Budget" value={formatCurrency(a.annualBudget, { compact: true })} />
          <Field label="Funding Growth" value={`${(a.fundingGrowth * 100).toFixed(1)}%/yr`} />
          <Field label="Discount Rate" value={`${(a.discountRate * 100).toFixed(2)}%`} />
          <Field label="Analysis Period" value={`${a.analysisPeriodYears} yr`} />
          <Field label="Condition Target" value={String(a.conditionTarget)} />
          <Field label="Risk Threshold" value={String(a.riskThreshold)} />
        </CardContent>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
