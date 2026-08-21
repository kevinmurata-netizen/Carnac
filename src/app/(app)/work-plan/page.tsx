import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listWorkPlans } from "@/server/workplans";
import { getAnnualBudget } from "@/server/scenarios";
import { DEFAULT_WEIGHTS, OBJECTIVE_LABELS, OBJECTIVE_DESCRIPTIONS } from "@/domain/waterline/optimization";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import { generateWorkPlanAction } from "./actions";
import { getPageName } from "@/server/navigation";

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function WorkPlanPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/work-plan", "Work Plan");

  const [plans, annualBudget] = await Promise.all([listWorkPlans(), getAnnualBudget(organizationId)]);
  const canEdit = canRecordFieldData(session);
  const currentYear = new Date().getFullYear();

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Multi-year capital programme built by weighted multi-objective prioritization under a budget constraint"
      />

      <Card>
        <CardHeader>
          <CardTitle>Work Plans</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Scenario</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead>Total Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No work plans yet — generate one below.
                  </TableCell>
                </TableRow>
              )}
              {plans.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/work-plan/${p.id}`} className="font-medium text-primary hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {p.startYear}–{p.endYear}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.scenarioName ?? "—"}</TableCell>
                  <TableCell>{formatNumber(p.itemCount)}</TableCell>
                  <TableCell>{formatCurrency(p.totalCost, { compact: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canEdit && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Generate a Work Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={generateWorkPlanAction} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="name">Plan Name</Label>
                  <input id="name" name="name" required defaultValue="5-Year Capital Work Plan" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="startYear">Start Year</Label>
                  <input id="startYear" name="startYear" type="number" defaultValue={currentYear} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="years">Years</Label>
                  <input id="years" name="years" type="number" min={1} max={20} defaultValue={5} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fundingGrowthPct">Funding Growth (%/yr)</Label>
                  <input
                    id="fundingGrowthPct"
                    name="fundingGrowthPct"
                    type="number"
                    step={0.5}
                    defaultValue={3}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="annualBudget">Annual Budget ($)</Label>
                  <input
                    id="annualBudget"
                    name="annualBudget"
                    type="number"
                    min={0}
                    step={100000}
                    defaultValue={annualBudget ?? 4000000}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-foreground">Objective Weights</div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Weights are normalized, so 30/40/20/10 and 3/4/2/1 give the same ranking. Each candidate&apos;s
                  objectives are rescaled 0–100 across the whole candidate set, then combined as a weighted sum —
                  the published formula, no black box.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <WeightField
                    id="wCondition"
                    label={OBJECTIVE_LABELS.conditionImprovement}
                    hint={OBJECTIVE_DESCRIPTIONS.conditionImprovement}
                    defaultValue={DEFAULT_WEIGHTS.conditionImprovement * 100}
                  />
                  <WeightField
                    id="wRisk"
                    label={OBJECTIVE_LABELS.riskReduction}
                    hint={OBJECTIVE_DESCRIPTIONS.riskReduction}
                    defaultValue={DEFAULT_WEIGHTS.riskReduction * 100}
                  />
                  <WeightField
                    id="wLcc"
                    label={OBJECTIVE_LABELS.lifeCycleCost}
                    hint={OBJECTIVE_DESCRIPTIONS.lifeCycleCost}
                    defaultValue={DEFAULT_WEIGHTS.lifeCycleCost * 100}
                  />
                  <WeightField
                    id="wCriticality"
                    label={OBJECTIVE_LABELS.criticality}
                    hint={OBJECTIVE_DESCRIPTIONS.criticality}
                    defaultValue={DEFAULT_WEIGHTS.criticality * 100}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit">Generate Work Plan</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function WeightField({
  id,
  label,
  hint,
  defaultValue,
}: {
  id: string;
  label: string;
  hint: string;
  defaultValue: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label} (%)</Label>
      <input
        id={id}
        name={id}
        type="number"
        min={0}
        max={100}
        defaultValue={defaultValue}
        className={inputClass}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
