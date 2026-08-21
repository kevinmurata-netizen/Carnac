import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkPlanItemStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getWorkPlan } from "@/server/workplans";
import { getAnnualBudget } from "@/server/scenarios";
import { getConditionBand } from "@/domain/waterline/condition";
import { getRiskBand } from "@/domain/waterline/risk";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimpleBarChart } from "@/components/charts/simple-bar-chart";
import { formatCurrency, formatNumber } from "@/lib/format";
import { moveItemAction, updateStatusAction, deleteWorkPlanAction } from "../actions";
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

export default async function WorkPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const conditionBands = await getConditionBands(organizationId);

  const [plan, annualBudget] = await Promise.all([getWorkPlan(id), getAnnualBudget(organizationId)]);
  if (!plan) notFound();

  const canEdit = canRecordFieldData(session);
  const years = plan.years;
  const budgetFor = (index: number) => (annualBudget ?? 0) * Math.pow(1.03, index);
  const overBudgetYears = years.filter((y, i) => annualBudget != null && y.totalCost > budgetFor(i));

  return (
    <div>
      <SetBreadcrumb segment={id} label={plan.name} />
      <PageHeader
        title={plan.name}
        description={`${plan.startYear}–${plan.endYear}${plan.scenarioName ? ` · from scenario "${plan.scenarioName}"` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <form action={deleteWorkPlanAction}>
                <input type="hidden" name="workPlanId" value={plan.id} />
                <Button type="submit" size="sm" variant="destructive">
                  Delete
                </Button>
              </form>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Projects" value={formatNumber(plan.itemCount)} sublabel="Across all years" icon={ListChecks} />
        <KpiCard
          label="Total Programme Cost"
          value={formatCurrency(plan.totalCost, { compact: true })}
          sublabel={`${plan.endYear - plan.startYear + 1}-year plan`}
          icon={DollarSign}
        />
        <KpiCard
          label="Annual Budget"
          value={annualBudget != null ? formatCurrency(annualBudget, { compact: true }) : "—"}
          sublabel="Base year, grows 3%/yr"
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
                        <TableHead>Condition</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Est. Cost</TableHead>
                        <TableHead>Expected Benefit</TableHead>
                        <TableHead>Funding</TableHead>
                        <TableHead>Status</TableHead>
                        {canEdit && <TableHead>Move To</TableHead>}
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
                            <TableCell>{item.treatment}</TableCell>
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
                              {canEdit ? (
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
                            {canEdit && (
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
