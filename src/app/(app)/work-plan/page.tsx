import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listWorkPlans } from "@/server/workplans";
import { getAnnualBudget } from "@/server/scenarios";
import { normalizeWeights, type ObjectiveWeights } from "@/domain/waterline/optimization";
import { listWeightSets } from "@/server/weight-sets";
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

  const [plans, annualBudget, weightSets] = await Promise.all([
    listWorkPlans(),
    getAnnualBudget(organizationId),
    listWeightSets(organizationId),
  ]);
  const canEdit = canRecordFieldData(session);
  const currentYear = new Date().getFullYear();
  const defaultSet = weightSets.find((s) => s.isDefault) ?? weightSets[0];

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Multi-year capital program built by weighted multi-objective prioritization under a budget constraint"
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

              {/* Chosen, not retyped. The weighting is a policy decision that
                  outlives one generation run, so it is a named row picked from
                  a list — and the plan records which one it used. */}
              <div>
                <div className="mb-2 text-sm font-medium text-foreground">Objective Weights</div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Each candidate&apos;s objectives are rescaled 0–100 across the whole candidate set, then combined as
                  a weighted sum — the published formula, no black box.{" "}
                  <Link href="/settings/scenario-weights" className="text-primary hover:underline">
                    Add or edit weightings →
                  </Link>
                </p>
                <div className="max-w-xl space-y-1.5">
                  <Label htmlFor="weightSetId">Weighting</Label>
                  <select id="weightSetId" name="weightSetId" defaultValue={defaultSet?.id ?? ""} className={inputClass}>
                    {weightSets.length === 0 && <option value="">Built-in 30/40/20/10</option>}
                    {weightSets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.isDefault ? " (default)" : ""} — {describeSplit(s.weights)}
                      </option>
                    ))}
                  </select>
                  {weightSets.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No weightings saved yet, so the built-in defaults apply.{" "}
                      <Link href="/settings/scenario-weights" className="text-primary hover:underline">
                        Create one
                      </Link>{" "}
                      to compare policies rather than numbers.
                    </p>
                  )}
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

/** The normalized split, so an option reads as a policy rather than as four
 * numbers whose sum the reader has to work out. */
function describeSplit(weights: ObjectiveWeights) {
  const n = normalizeWeights(weights);
  const pct = (v: number) => Math.round(v * 100);
  return `condition ${pct(n.conditionImprovement)}%, risk ${pct(n.riskReduction)}%, life-cycle ${pct(
    n.lifeCycleCost
  )}%, criticality ${pct(n.criticality)}%`;
}
