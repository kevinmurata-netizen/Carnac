import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkPlanItemStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getWorkPlan, runWorkPlan, type WorkPlanYear } from "@/server/workplans";
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
import { ProjectRows } from "./project-rows";
import { ImportDialog } from "./import-dialog";
import { SubmitButton, PendingLinkButton } from "@/components/ui/pending-button";
import { listTreatments } from "@/server/treatments";
import { CalendarRange, DollarSign, ListChecks, TriangleAlert } from "lucide-react";
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
            {editable && <ImportDialog workPlanId={plan.id} startYear={plan.startYear} endYear={plan.endYear} />}
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
                So it cannot be edited: moving work between years, adding work, combining treatments into a project or
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
              {plan.hasLeadTimes
                ? "Takes each project's money in the year this plan pays for it and applies the work in the year it is built, then ages the network — so the gap between paying and building shows up as the deterioration it allows."
                : "Applies the work in the years it is scheduled, then ages the network — so moving a job later shows up as the years of deterioration it buys."}
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

            {/* A plan with delivery lead times pays for work later years build.
                The run walks on past the last year the plan pays for, so that
                work is shown arriving rather than dropped — and the years past
                the end spend nothing, which is why they are worth explaining. */}
            {plan.lastBuildYear > plan.endYear && (
              <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                {formatNumber(builtAfter(years, plan.endYear))} project
                {builtAfter(years, plan.endYear) === 1 ? " is" : "s are"} built after {plan.endYear}, the last year
                this plan pays for. The run carries on to {plan.lastBuildYear} so that work is counted; those years
                spend nothing.
              </div>
            )}

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
                    <TableHead className="text-right">{plan.hasLeadTimes ? "Segments built" : "Segments treated"}</TableHead>
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

      <div className={plan.hasLeadTimes ? "mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" : ""}>
        <Card className={plan.hasLeadTimes ? "" : "mt-4"}>
          <CardHeader>
            <CardTitle>{plan.hasLeadTimes ? "Spending by Year" : "Allocation by Year"}</CardTitle>
            {plan.hasLeadTimes && (
              <p className="mt-1 text-sm font-normal text-muted-foreground">
                When the money leaves the budget.
              </p>
            )}
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

        {/* The other half of the same plan: what it pays for, and when that
            work actually reaches the network. Two charts rather than one
            because the gap between them is the thing worth seeing. */}
        {plan.hasLeadTimes && (
          <Card>
            <CardHeader>
              <CardTitle>Work Built by Year</CardTitle>
              <p className="mt-1 text-sm font-normal text-muted-foreground">
                When the network actually improves.
              </p>
            </CardHeader>
            <CardContent>
              <SimpleBarChart data={builtByYear(years, plan.lastBuildYear)} xKey="year" yKey="cost" valueFormat="currency-compact" />
            </CardContent>
          </Card>
        )}
      </div>

      {years.map((y, i) => {
        const budget = budgetFor(i);
        const over = annualBudget != null && y.totalCost > budget;
        const projects = groupProjects(y.items);
        return (
          <Card key={y.year} className="mt-4">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>
                  {y.year} — {formatNumber(projects.length)} project{projects.length === 1 ? "" : "s"}
                </CardTitle>
                {/* Said once per year rather than on every row: with delivery
                    lead times this heading is about money, and the work itself
                    happens in the year each row's Built column gives. */}
                {plan.hasLeadTimes && (
                  <p className="mt-1 text-xs font-normal text-muted-foreground">
                    What {y.year} pays for. Each project is built in the year its own row says.
                    {/* A project whose cost is spread pays part of it in years
                        it is not listed in, so a year's total can exceed the
                        rows under it. Said where the number is, not in a
                        footnote nobody reads. */}
                    {Math.abs(y.totalCost - y.items.reduce((sum, i) => sum + i.estimatedCost, 0)) > 1 &&
                      " The total includes instalments of projects listed under other years."}
                  </p>
                )}
              </div>
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
              {projects.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">No work scheduled in this year.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Treatment</TableHead>
                        {plan.hasLeadTimes && <TableHead>Decided</TableHead>}
                        {plan.hasLeadTimes && <TableHead>Built</TableHead>}
                        {editable && <TableHead className="sr-only">Combine or split</TableHead>}
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
                      {projects.map((project) => {
                        const first = project.items[0];
                        const cBand = first.conditionNow != null ? getConditionBand(first.conditionNow, conditionBands) : null;
                        const rBand = first.riskNow != null ? getRiskBand(first.riskNow) : null;
                        const combined = project.items.length > 1 || first.bundleId != null;
                        const priority = maxOf(project.items.map((m) => m.priorityScore));
                        const riskCut = maxOf(project.items.map((m) => m.riskReductionPct));
                        const funding = [...new Set(project.items.map((m) => m.fundingSource).filter(Boolean))].join(", ");
                        const statuses = [...new Set(project.items.map((m) => m.status))];

                        // Every cell after the first, shared by a single
                        // treatment and a combined project. Actions go through
                        // the first row; the server applies them to the whole
                        // project, since a project is one job.
                        const cells = (
                          <>
                            <TableCell className="text-xs">{first.serviceArea ?? "—"}</TableCell>
                            <TableCell>
                              {combined ? (
                                <span className="text-muted-foreground">
                                  {project.items.length} treatments
                                  {first.bundleName && !first.combinedByHand && (
                                    <Badge
                                      variant="outline"
                                      className="ml-1.5"
                                      title={`Funded by the model as ${first.bundleName}: one project, mobilization charged once.`}
                                    >
                                      {first.bundleName}
                                    </Badge>
                                  )}
                                </span>
                              ) : (
                                <>
                                  {first.treatment}
                                  <HandBadges item={first} />
                                </>
                              )}
                            </TableCell>
                            {/* The year it was decided and the year it is done.
                                A project waiting years for construction is the
                                thing a reader most needs to see beside it. */}
                            {plan.hasLeadTimes && (
                              <TableCell className="tabular-nums">{first.programmedYear}</TableCell>
                            )}
                            {plan.hasLeadTimes && (
                              <TableCell className="tabular-nums">
                                {first.buildYear}
                                {first.buildYear > plan.endYear && (
                                  <Badge
                                    variant="outline"
                                    className="ml-1.5"
                                    title="Paid for inside this plan, but built after it ends"
                                  >
                                    after
                                  </Badge>
                                )}
                              </TableCell>
                            )}
                            {/* Right beside the treatment, in words: a merge icon at
                                the far edge of a wide table went unnoticed, and
                                nobody could tell what it did. */}
                            {editable && (
                              <TableCell className="whitespace-nowrap">
                                {first.bundleId ? (
                                  <form action={splitVisitAction}>
                                    <input type="hidden" name="workPlanId" value={plan.id} />
                                    <input type="hidden" name="bundleId" value={first.bundleId} />
                                    <SubmitButton
                                      size="xs"
                                      variant="outline"
                                      pendingLabel="Splitting…"
                                      title={`Split ${project.projectId} back into separate treatments, each priced on its own`}
                                    >
                                      Split
                                    </SubmitButton>
                                  </form>
                                ) : (
                                  <CombineDialog
                                    workPlanId={plan.id}
                                    assetId={first.assetId}
                                    assetCode={first.assetCode}
                                    itemId={first.id}
                                    treatment={first.treatment}
                                    year={y.year}
                                    years={years.map((yy) => yy.year)}
                                  />
                                )}
                              </TableCell>
                            )}
                            <TableCell style={cBand ? { color: cBand.color } : undefined}>
                              {first.conditionNow ?? "—"}
                            </TableCell>
                            <TableCell style={rBand ? { color: rBand.color } : undefined}>{first.riskNow ?? "—"}</TableCell>
                            <TableCell className="font-medium">{priority ?? "—"}</TableCell>
                            <TableCell>
                              {formatCurrency(project.cost)}
                              {/* Where the cost is spread, the row sits in the
                                  year that carries most of it and says where
                                  the rest goes, rather than claiming a year
                                  spends money it does not. */}
                              {first.instalments && (
                                <div
                                  className="text-[11px] text-muted-foreground"
                                  title="This project's cost leaves the budget over more than one year"
                                >
                                  {first.instalments
                                    .map((i) => `${formatCurrency(i.amount, { compact: true })} in ${i.year}`)
                                    .join(", ")}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{riskCut != null ? `${riskCut}% risk cut` : "—"}</TableCell>
                            <TableCell className="text-xs">{funding || "—"}</TableCell>
                            <TableCell>
                              {editable ? (
                                <form action={updateStatusAction} className="flex items-center gap-1">
                                  <input type="hidden" name="itemId" value={first.id} />
                                  <select
                                    name="status"
                                    defaultValue={first.status}
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
                              ) : statuses.length === 1 ? (
                                <Badge variant={STATUS_VARIANT[first.status] ?? "outline"}>{first.status}</Badge>
                              ) : (
                                <Badge variant="outline">MIXED</Badge>
                              )}
                            </TableCell>
                            {editable && (
                              <TableCell>
                                <form action={moveItemAction} className="flex items-center gap-1">
                                  <input type="hidden" name="itemId" value={first.id} />
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
                                  <input type="hidden" name="itemId" value={first.id} />
                                  <ConfirmDelete
                                    size="xs"
                                    variant="ghost"
                                    ariaLabel={`Remove ${project.projectId}`}
                                    title={`Remove ${project.projectId}?`}
                                    description={
                                      combined
                                        ? `All ${project.items.length} treatments in this project are removed from this plan. To remove just one, split the project first. The scenario is untouched.`
                                        : first.addedByHand
                                          ? "It was added by hand, so nothing regenerates it. This cannot be undone."
                                          : "It came from the scenario this plan was made from. Removing it changes this plan only; the scenario is untouched, and making a new plan from that scenario would bring it back."
                                    }
                                  >
                                    Remove
                                  </ConfirmDelete>
                                </form>
                              </TableCell>
                            )}
                          </>
                        );

                        if (!combined) {
                          return (
                            <TableRow key={project.key}>
                              <TableCell>
                                <Link
                                  href={`/assets/${first.assetId}?tab=treatments`}
                                  className="font-medium text-primary hover:underline"
                                >
                                  {first.assetCode}
                                </Link>
                              </TableCell>
                              {cells}
                            </TableRow>
                          );
                        }

                        // Twirled open: one row per treatment, with what is
                        // its own — its share of the cost, its benefit, its
                        // status. Moving or removing it alone would break the
                        // project apart, so those stay on the project row.
                        return (
                          <ProjectRows key={project.key} projectId={project.projectId} cells={cells}>
                            {project.items.map((m, index) => (
                              <TableRow
                                key={m.id}
                                className={`bg-muted/30 text-muted-foreground ${index < project.items.length - 1 ? "border-b-0" : ""}`}
                              >
                                <TableCell className="pl-10 text-xs">
                                  {index === 0 && (
                                    <Link
                                      href={`/assets/${m.assetId}?tab=treatments`}
                                      className="text-primary hover:underline"
                                    >
                                      Open {m.assetCode}
                                    </Link>
                                  )}
                                </TableCell>
                                <TableCell />
                                <TableCell className="text-foreground">
                                  {m.treatment}
                                  <HandBadges item={m} />
                                </TableCell>
                                {plan.hasLeadTimes && <TableCell />}
                                {plan.hasLeadTimes && <TableCell />}
                                {editable && <TableCell />}
                                <TableCell />
                                <TableCell />
                                <TableCell>{m.priorityScore ?? "—"}</TableCell>
                                <TableCell>{formatCurrency(m.estimatedCost)}</TableCell>
                                <TableCell>
                                  {m.riskReductionPct != null ? `${m.riskReductionPct}% risk cut` : "—"}
                                </TableCell>
                                <TableCell className="text-xs">{m.fundingSource ?? "—"}</TableCell>
                                <TableCell>
                                  <Badge variant={STATUS_VARIANT[m.status] ?? "outline"}>{m.status}</Badge>
                                </TableCell>
                                {editable && <TableCell />}
                                {editable && <TableCell />}
                              </TableRow>
                            ))}
                          </ProjectRows>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <details className="border-t px-6 py-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Why these projects, in this order?
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {projects.map((project) => (
                        <li key={project.key} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{project.projectId}</span> —{" "}
                          {project.items[0].reason}
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

type PlanItem = WorkPlanYear["items"][number];

/**
 * A year's rows as projects: a treatment on its own, or every treatment
 * combined into one job on a segment. Kept in the order the rows came, which
 * is by priority, so a project sits where its best treatment ranks.
 */
function groupProjects(items: PlanItem[]) {
  const projects = new Map<string, { key: string; items: PlanItem[] }>();
  for (const item of items) {
    const key = item.bundleId ?? item.id;
    const project = projects.get(key) ?? { key, items: [] };
    project.items.push(item);
    projects.set(key, project);
  }
  return [...projects.values()].map((p) => ({
    ...p,
    /** "WL-0058 - Leak Repair, Spot Repair" for a combined project; the
     * asset code alone for one treatment. */
    projectId:
      p.items.length > 1 || p.items[0].bundleId
        ? `${p.items[0].assetCode} - ${p.items.map((m) => m.treatment).join(", ")}`
        : p.items[0].assetCode,
    cost: p.items.reduce((sum, m) => sum + m.estimatedCost, 0),
  }));
}

/** Projects built after the last year the plan pays for anything. */
function builtAfter(years: WorkPlanYear[], endYear: number) {
  const bundles = new Set<string>();
  for (const year of years) {
    for (const item of year.items) if (item.buildYear > endYear) bundles.add(item.bundleId ?? item.id);
  }
  return bundles.size;
}

/** What the plan builds each year, by the cost of the work done in it — which
 * is not what each year pays for once delivery lead times separate the two. */
function builtByYear(years: WorkPlanYear[], lastBuildYear: number) {
  const cost = new Map<number, number>();
  for (const year of years) {
    for (const item of year.items) cost.set(item.buildYear, (cost.get(item.buildYear) ?? 0) + item.estimatedCost);
  }
  const first = years[0]?.year ?? lastBuildYear;
  const out: Array<{ year: string; cost: number }> = [];
  for (let y = first; y <= lastBuildYear; y++) out.push({ year: String(y), cost: Math.round(cost.get(y) ?? 0) });
  return out;
}

function maxOf(values: Array<number | null>) {
  const known = values.filter((v): v is number => v != null);
  return known.length ? Math.max(...known) : null;
}

/** Says when a treatment was put here by a person rather than the model. */
function HandBadges({ item }: { item: PlanItem }) {
  if (!item.addedByHand) return null;
  return (
    <Badge
      variant={item.forcedAgainstRules ? "destructive" : "secondary"}
      className="ml-1.5"
      title={
        item.forcedAgainstRules
          ? `${item.imported ? "Imported" : "Added by hand"}. Its rules refuse it here — ${item.refusedBy ?? "the treatment's own rules"}.`
          : item.imported
            ? "Imported from a spreadsheet of programmed work rather than chosen by the model."
            : "Added by hand rather than chosen by the model."
      }
    >
      {item.forcedAgainstRules ? "forced" : item.imported ? "imported" : "added"}
    </Badge>
  );
}
