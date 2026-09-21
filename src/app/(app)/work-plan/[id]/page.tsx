import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkPlanItemStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getWorkPlan, runWorkPlan } from "@/server/workplans";
import { getAnnualBudget } from "@/server/scenarios";
import { getConditionBand } from "@/domain/waterline/condition";
import { getRiskBand } from "@/domain/waterline/risk";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  moveItemAction,
  updateStatusAction,
  deleteWorkPlanAction,
  removeItemAction,
  splitVisitAction,
  createFromScenarioAction,
} from "../actions";
import { AddWorkDialog } from "./add-work-dialog";
import { CombineDialog } from "./combine-dialog";
import { SubmitButton, PendingLinkButton } from "@/components/ui/pending-button";
import { listTreatments } from "@/server/treatments";
import { CalendarRange, DollarSign, ListChecks, Split, TriangleAlert } from "lucide-react";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";
import { getConditionBands } from "@/server/settings";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PLANNED: "outline",
  APPROVED: "default",
  IN_PROGRESS: "default",
  COMPLETE: "secondary",
  DEFERRED: "secondary",
  CANCELLED: "destructive",
};

export default async function WorkPlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { id } = await params;
  const { run } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const conditionBands = await getConditionBands(organizationId);

  const [plan, orgBudget, treatments] = await Promise.all([
    getWorkPlan(id),
    getAnnualBudget(organizationId),
    listTreatments(organizationId),
  ]);
  if (!plan) notFound();

  const canEdit = canRecordFieldData(session);
  // A scenario run's own record is rebuilt from scratch every time that
  // scenario runs, so every edit here would be thrown away. The page says so
  // and offers the editable copy instead of quietly losing someone's work.
  const editable = canEdit && !plan.isScenarioMirror;
  const years = plan.years;
  // The plan's own budget where it froze one, so a plan made from a scenario
  // is measured against that scenario's money rather than today's.
  const annualBudget = plan.annualBudget ?? orgBudget;
  const growth = plan.fundingGrowth ?? 0.03;
  const budgetFor = (index: number) => (annualBudget ?? 0) * Math.pow(1 + growth, index);
  const overBudgetYears = years.filter((y, i) => annualBudget != null && y.totalCost > budgetFor(i));

  // Run on request rather than on every view: it walks the whole network for
  // every year of the plan, and most visits are here to read the schedule.
  const outcome = run === "1" ? await runWorkPlan(organizationId, id) : null;

  return (
    <div>
      <SetBreadcrumb segment={id} label={plan.name} />
      <PageHeader
        title={plan.name}
        description={`${plan.startYear}–${plan.endYear}${plan.scenarioName ? ` · from scenario "${plan.scenarioName}"` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {editable && (
              <AddWorkDialog
                workPlanId={plan.id}
                treatments={treatments.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
                years={years.map((y) => y.year)}
                defaultYear={plan.startYear}
              />
            )}
            {canEdit && (
              <form action={deleteWorkPlanAction}>
                <input type="hidden" name="workPlanId" value={plan.id} />
                <ConfirmDelete
                  pendingLabel="Deleting…"
                  title={`Delete ${plan.name}?`}
                  description={
                    plan.scenarioName
                      ? `Its ${formatNumber(plan.itemCount)} projects are deleted with it. This plan came from the scenario “${plan.scenarioName}”; re-running that scenario builds its funded program again.`
                      : `Its ${formatNumber(plan.itemCount)} projects are deleted with it. This cannot be undone.`
                  }
                >
                  Delete
                </ConfirmDelete>
              </form>
            )}
          </div>
        }
      />

      {/* Said before anything else on the page: this is the run's record, and
          the controls someone came here for are deliberately absent. */}
      {plan.isScenarioMirror && (
        <Card className="mb-4 border-dashed">
          <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">This is the scenario run&apos;s own record</p>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {plan.scenarioName
                  ? `“${plan.scenarioName}” writes this plan every time it runs, replacing whatever was here. `
                  : "The scenario that produced this plan rewrites it on every run. "}
                So it cannot be edited: moving work between years, adding work, combining jobs into one visit or
                changing a status would all be lost the next time that scenario runs. Make a plan from the scenario
                and the copy is yours to change.
              </p>
            </div>
            {canEdit && plan.scenarioId && (
              <form action={createFromScenarioAction} className="shrink-0">
                <input type="hidden" name="scenarioId" value={plan.scenarioId} />
                <input type="hidden" name="name" value={`${plan.scenarioName ?? plan.name} — Work Plan`} />
                <SubmitButton pendingLabel="Creating the plan…">Make an editable plan</SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Projects" value={formatNumber(plan.itemCount)} sublabel="Across all years" icon={ListChecks} />
        <KpiCard
          label="Total Program Cost"
          value={formatCurrency(plan.totalCost, { compact: true })}
          sublabel={`${plan.endYear - plan.startYear + 1}-year plan`}
          icon={DollarSign}
        />
        <KpiCard
          label="Annual Budget"
          value={annualBudget != null ? formatCurrency(annualBudget, { compact: true }) : "—"}
          sublabel={`Base year, grows ${Math.round(growth * 1000) / 10}%/yr`}
          icon={CalendarRange}
        />
        <KpiCard
          label="Years Over Budget"
          value={formatNumber(overBudgetYears.length)}
          sublabel={overBudgetYears.length ? overBudgetYears.map((y) => y.year).join(", ") : "All years within budget"}
          icon={TriangleAlert}
          tone={overBudgetYears.length > 0 ? "danger" : "default"}
        />
      </div>

      {/* What this schedule does to the network. Run on request: the plan is
          the decision, and this is the consequence of having moved it about. */}
      <Card className="mt-4">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>What this plan does</CardTitle>
            <p className="mt-1 text-sm font-normal text-muted-foreground">
              Applies the work in the years it is scheduled, then ages the network — so moving a job later shows up as
              the years of deterioration it buys.
              {plan.scenarioName ? ` Compared against the scenario “${plan.scenarioName}”.` : ""}
            </p>
          </div>
          {/* Same page, new query — no loading screen appears for that, so the
              button itself says the plan is running. It takes a few seconds:
              it walks the whole network for every year of the plan. */}
          <PendingLinkButton
            href={`/work-plan/${plan.id}?run=1`}
            variant={outcome ? "outline" : "default"}
            pendingLabel="Running the plan…"
          >
            {outcome ? "Run again" : "Run this plan"}
          </PendingLinkButton>
        </CardHeader>
        {outcome && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label="Final Condition"
                value={String(outcome.result.finalAvgCondition)}
                sublabel={
                  outcome.scenario?.finalAvgCondition != null
                    ? `Scenario ends at ${outcome.scenario.finalAvgCondition}`
                    : `From ${outcome.result.startAvgCondition} today`
                }
                icon={CalendarRange}
              />
              <KpiCard
                label="Expected Failures"
                value={formatNumber(outcome.result.totalFailures)}
                sublabel={
                  outcome.scenario ? `Scenario ${formatNumber(Math.round(outcome.scenario.totalFailures))}` : "Over the plan"
                }
                icon={TriangleAlert}
              />
              <KpiCard
                label="Spend"
                value={formatCurrency(outcome.result.totalSpend, { compact: true })}
                sublabel={
                  outcome.scenario
                    ? `Scenario ${formatCurrency(outcome.scenario.totalSpend, { compact: true })}`
                    : "As scheduled"
                }
                icon={DollarSign}
              />
              <KpiCard
                label="Failure Cost"
                value={formatCurrency(outcome.result.totalFailureCost, { compact: true })}
                sublabel="Expected, over the plan"
                icon={DollarSign}
              />
            </div>

            {outcome.result.skipped.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-500">
                {formatNumber(outcome.result.skipped.length)} scheduled{" "}
                {outcome.result.skipped.length === 1 ? "job" : "jobs"} could not be carried out:{" "}
                {[...new Set(outcome.result.skipped.map((s) => s.reason))].join("; ")}.
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Segments treated</TableHead>
                    <TableHead className="text-right">Avg condition</TableHead>
                    <TableHead className="text-right">Scenario</TableHead>
                    <TableHead className="text-right">Expected failures</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outcome.result.years.map((y) => {
                    const scenarioYear = outcome.scenario?.years.find((s) => s.year === y.year);
                    return (
                      <TableRow key={y.year} className={y.overBudget ? "bg-destructive/5" : undefined}>
                        <TableCell className="font-medium tabular-nums">{y.year}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(y.spend, { compact: true })}
                          {y.overBudget && (
                            <Badge variant="destructive" className="ml-2">
                              Over
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(y.budget, { compact: true })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(y.treatedCount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{y.avgCondition}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {scenarioYear?.avgCondition ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{y.expectedFailures}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Allocation by Year</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart
            data={years.map((y) => ({ year: String(y.year), cost: y.totalCost }))}
            xKey="year"
            yKey="cost"
            valueFormat="currency-compact"
          />
        </CardContent>
      </Card>

      {years.map((y, i) => {
        const budget = budgetFor(i);
        const over = annualBudget != null && y.totalCost > budget;
        return (
          <Card key={y.year} className="mt-4">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                {y.year} — {formatNumber(y.items.length)} project{y.items.length === 1 ? "" : "s"}
              </CardTitle>
              <div className="text-sm">
                <span className={over ? "font-medium text-destructive" : "font-medium text-foreground"}>
                  {formatCurrency(y.totalCost, { compact: true })}
                </span>
                {annualBudget != null && (
                  <span className="text-muted-foreground"> / {formatCurrency(budget, { compact: true })} budget</span>
                )}
                {over && <Badge variant="destructive" className="ml-2">Over budget</Badge>}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {y.items.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">No work scheduled in this year.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Asset</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Treatment</TableHead>
                        {editable && <TableHead>Visit</TableHead>}
                        <TableHead>Condition</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Est. Cost</TableHead>
                        <TableHead>Expected Benefit</TableHead>
                        <TableHead>Funding</TableHead>
                        <TableHead>Status</TableHead>
                        {editable && <TableHead>Move To</TableHead>}
                        {editable && <TableHead className="sr-only">Remove</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {y.items.map((item) => {
                        const cBand = item.conditionNow != null ? getConditionBand(item.conditionNow, conditionBands) : null;
                        const rBand = item.riskNow != null ? getRiskBand(item.riskNow) : null;
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Link
                                href={`/assets/${item.assetId}?tab=treatments`}
                                className="font-medium text-primary hover:underline"
                              >
                                {item.assetCode}
                              </Link>
                            </TableCell>
                            <TableCell className="text-xs">{item.serviceArea ?? "—"}</TableCell>
                            <TableCell>
                              {item.treatment}
                              {item.bundleName && (
                                <Badge
                                  variant="outline"
                                  className="ml-1.5"
                                  title={
                                    item.combinedByHand
                                      ? `Combined by hand into ${item.bundleName}: one visit, mobilization charged once.`
                                      : `Part of ${item.bundleName}, funded as one visit.`
                                  }
                                >
                                  {item.bundleName}
                                </Badge>
                              )}
                              {item.addedByHand && (
                                <Badge
                                  variant={item.forcedAgainstRules ? "destructive" : "secondary"}
                                  className="ml-1.5"
                                  title={
                                    item.forcedAgainstRules
                                      ? `Added by hand. Its rules refuse it here — ${item.refusedBy ?? "the treatment's own rules"}.`
                                      : "Added by hand rather than chosen by the model."
                                  }
                                >
                                  {item.forcedAgainstRules ? "forced" : "added"}
                                </Badge>
                              )}
                            </TableCell>
                            {/* Right beside the treatment, in words: a merge icon at
                                the far edge of a wide table went unnoticed, and
                                nobody could tell what it did. */}
                            {editable && (
                              <TableCell className="whitespace-nowrap">
                                {item.bundleId ? (
                                  <form action={splitVisitAction}>
                                    <input type="hidden" name="workPlanId" value={plan.id} />
                                    <input type="hidden" name="bundleId" value={item.bundleId} />
                                    <SubmitButton
                                      size="xs"
                                      variant="outline"
                                      pendingLabel="Splitting…"
                                      title={`Split ${item.bundleName} back into separate jobs, each priced on its own`}
                                    >
                                      <Split className="mr-1 h-3.5 w-3.5" />
                                      Split visit
                                    </SubmitButton>
                                  </form>
                                ) : (
                                  <CombineDialog
                                    workPlanId={plan.id}
                                    assetId={item.assetId}
                                    assetCode={item.assetCode}
                                    itemId={item.id}
                                    treatment={item.treatment}
                                    year={y.year}
                                    years={years.map((yy) => yy.year)}
                                  />
                                )}
                              </TableCell>
                            )}
                            <TableCell style={cBand ? { color: cBand.color } : undefined}>
                              {item.conditionNow ?? "—"}
                            </TableCell>
                            <TableCell style={rBand ? { color: rBand.color } : undefined}>
                              {item.riskNow ?? "—"}
                            </TableCell>
                            <TableCell className="font-medium">{item.priorityScore ?? "—"}</TableCell>
                            <TableCell>{formatCurrency(item.estimatedCost)}</TableCell>
                            <TableCell>
                              {item.riskReductionPct != null ? `${item.riskReductionPct}% risk cut` : "—"}
                            </TableCell>
                            <TableCell className="text-xs">{item.fundingSource ?? "—"}</TableCell>
                            <TableCell>
                              {editable ? (
                                <form action={updateStatusAction} className="flex items-center gap-1">
                                  <input type="hidden" name="itemId" value={item.id} />
                                  <select
                                    name="status"
                                    defaultValue={item.status}
                                    className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
                                  >
                                    {Object.values(WorkPlanItemStatus).map((s) => (
                                      <option key={s} value={s}>
                                        {s}
                                      </option>
                                    ))}
                                  </select>
                                  <Button type="submit" size="xs" variant="outline">
                                    Set
                                  </Button>
                                </form>
                              ) : (
                                <Badge variant={STATUS_VARIANT[item.status] ?? "outline"}>{item.status}</Badge>
                              )}
                            </TableCell>
                            {editable && (
                              <TableCell>
                                <form action={moveItemAction} className="flex items-center gap-1">
                                  <input type="hidden" name="itemId" value={item.id} />
                                  <select
                                    name="targetYear"
                                    defaultValue={y.year}
                                    className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
                                  >
                                    {years.map((yy) => (
                                      <option key={yy.year} value={yy.year}>
                                        {yy.year}
                                      </option>
                                    ))}
                                  </select>
                                  <Button type="submit" size="xs" variant="outline">
                                    Move
                                  </Button>
                                </form>
                              </TableCell>
                            )}
                            {editable && (
                              <TableCell>
                                <form action={removeItemAction}>
                                  <input type="hidden" name="itemId" value={item.id} />
                                  <ConfirmDelete
                                    size="xs"
                                    variant="ghost"
                                    ariaLabel={`Remove ${item.treatment} on ${item.assetCode}`}
                                    title={`Remove ${item.treatment} on ${item.assetCode}?`}
                                    description={
                                      item.addedByHand
                                        ? "It was added by hand, so nothing regenerates it. This cannot be undone."
                                        : "It came from the scenario this plan was made from. Removing it changes this plan only; the scenario is untouched, and making a new plan from that scenario would bring it back."
                                    }
                                  >
                                    Remove
                                  </ConfirmDelete>
                                </form>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <details className="border-t px-6 py-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Why these projects, in this order?
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {y.items.map((item) => (
                        <li key={item.id} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{item.assetCode}</span> — {item.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <p className="mt-3 text-xs text-muted-foreground">
        Projects are ranked by a weighted sum of normalized objectives, then allocated year by year until each
        year&apos;s budget is exhausted. Moving a project between years re-totals both years immediately; a year
        pushed past its budget is flagged rather than silently rebalanced, because that is a funding decision for a
        person to make.
      </p>
    </div>
  );
}
