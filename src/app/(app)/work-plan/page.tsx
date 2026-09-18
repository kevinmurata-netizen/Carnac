import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listWorkPlans } from "@/server/workplans";
import { getAnnualBudget } from "@/server/scenarios";
import { normalizeWeights, type ObjectiveWeights } from "@/domain/waterline/optimization";
import { listWeightSets } from "@/server/weight-sets";
import { listCategoryWeightSets, toCategoryChoice } from "@/server/category-weight-sets";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import { generateWorkPlanAction, createFromScenarioAction } from "./actions";
import { listScenarios } from "@/server/scenarios";
import { getPageName } from "@/server/navigation";

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function WorkPlanPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/work-plan", "Work Plan");

  const [plans, annualBudget, weightSets, categorySets, scenarios] = await Promise.all([
    listWorkPlans(),
    getAnnualBudget(organizationId),
    listWeightSets(organizationId),
    listCategoryWeightSets(organizationId),
    listScenarios(organizationId),
  ]);
  const canEdit = canRecordFieldData(session);
  const currentYear = new Date().getFullYear();
  const defaultSet = weightSets.find((s) => s.isDefault) ?? weightSets[0];
  const categoryChoices = categorySets.map(toCategoryChoice);
  const defaultCategorySet = categoryChoices.find((s) => s.isDefault) ?? categoryChoices[0];

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Multi-year capital program: every option on every segment scored, then the best next step up bought anywhere on the network until each year's budget runs out"
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
                  <TableCell className="text-xs text-muted-foreground">
                    {p.scenarioName ?? "—"}
                    {p.isScenarioMirror && (
                      <span
                        className="ml-1.5 rounded border px-1.5 py-0.5 text-[10px]"
                        title="Written by the scenario run itself, and replaced every time that scenario runs again. Create a plan from the scenario below to have one you can change."
                      >
                        run&apos;s own
                      </span>
                    )}
                  </TableCell>
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
            <CardTitle>Plan from a scenario</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              Takes what the scenario funds, year by year, as a plan you can change — the scenario decides, and this is
              where you move the work about. The plan keeps the scenario&apos;s budget, and re-running the scenario
              leaves it alone.
            </p>
          </CardHeader>
          <CardContent>
            {scenarios.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scenarios yet.{" "}
                <Link href="/scenario-planning" className="text-primary hover:underline">
                  Create one in Scenario Planning
                </Link>{" "}
                and run it first.
              </p>
            ) : (
              <form action={createFromScenarioAction} className="flex flex-wrap items-end gap-4">
                <div className="min-w-64 flex-1 space-y-1.5">
                  <Label htmlFor="scenarioId">Scenario</Label>
                  <select id="scenarioId" name="scenarioId" required className={inputClass}>
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {formatCurrency(s.assumptions.annualBudget, { compact: true })}/yr,{" "}
                        {s.assumptions.analysisPeriodYears} years
                        {s.scenarioSet ? ` · ${s.scenarioSet.name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-64 flex-1 space-y-1.5">
                  <Label htmlFor="planName">Plan name</Label>
                  <input
                    id="planName"
                    name="name"
                    placeholder="Defaults to the scenario's name"
                    className={inputClass}
                  />
                </div>
                <Button type="submit">Create plan</Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Generate a Work Plan</CardTitle>
            <p className="text-sm font-normal text-muted-foreground">
              A plan with no scenario behind it: every option on every segment scored, then bought year by year against
              the budget below.
            </p>
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
                <div className="mb-2 text-sm font-medium text-foreground">How the work is ranked</div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Every option on every segment is scored as criticality × scale × category weight × expected benefit
                  ÷ cost — the same published formula Treatment Planning ranks by and scenarios buy by. The plan then
                  buys the best next step up anywhere on the network until each year&apos;s money runs out.{" "}
                  <Link href="/settings/scenario-weights" className="text-primary hover:underline">
                    Add or edit weightings →
                  </Link>
                </p>
                <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="weightSetId">Weighting</Label>
                    <select id="weightSetId" name="weightSetId" defaultValue={defaultSet?.id ?? ""} className={inputClass}>
                      {weightSets.length === 0 && <option value="">Built-in 30/40/20</option>}
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
                  {/* Chosen here rather than taken silently from the default:
                      it sets both how far the plan leans toward each kind of
                      work and the most of a year any one kind may take, and a
                      plan that funded no renewals should say which setting
                      decided that. */}
                  <div className="space-y-1.5">
                    <Label htmlFor="categoryWeightSetId">Category weighting</Label>
                    <select
                      id="categoryWeightSetId"
                      name="categoryWeightSetId"
                      defaultValue={defaultCategorySet?.id ?? ""}
                      className={inputClass}
                    >
                      {categoryChoices.length === 0 && <option value="">Even-handed (built-in)</option>}
                      {categoryChoices.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.isDefault ? " (default)" : ""} — {s.summary}
                          {/* Said on the option itself rather than in a note
                              below, which could only ever describe one of
                              them: a set that funds no renewals should say so
                              where it is chosen. */}
                          {s.excluded.length > 0 ? `; no ${s.excluded.join(", ")}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
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

/**
 * The normalized split, so an option reads as a policy rather than as three
 * numbers whose sum the reader has to work out.
 *
 * Criticality is left out, as it is on the scenario form and for the same
 * reason: it is not one of the things weighed against each other. It
 * multiplies the result instead — §5.3 — so printing it as a fourth share
 * would describe a formula that no longer exists.
 */
function describeSplit(weights: ObjectiveWeights) {
  const n = normalizeWeights(weights);
  const pct = (v: number) => Math.round(v * 100);
  return `condition ${pct(n.conditionImprovement)}%, risk ${pct(n.riskReduction)}%, life-cycle ${pct(
    n.lifeCycleCost
  )}%`;
}
