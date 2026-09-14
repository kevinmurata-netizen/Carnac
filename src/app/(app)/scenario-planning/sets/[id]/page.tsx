import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { getScenarioSet } from "@/server/scenario-sets";
import { listScenarios } from "@/server/scenarios";
import { estimateSetRunMs } from "@/server/run-estimate";
import { getConditionBands } from "@/server/settings";
import { describeWindow, endYear } from "@/lib/scenario-sets";
import { formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CalendarRange } from "lucide-react";
import { ScenarioComparison } from "../../scenario-comparison";
import { RunProgressButton } from "../../run-progress";
import { ScenarioSetStatusBadge } from "../status-badge";
import { ScenarioSetEditor } from "../set-editor";
import { assignScenarioAction, deleteScenarioSetAction, runScenarioSetAction } from "../actions";

export default async function ScenarioSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const [set, scenarios, bands, estimate] = await Promise.all([
    getScenarioSet(organizationId, id),
    listScenarios(organizationId),
    getConditionBands(organizationId),
    estimateSetRunMs(organizationId, id),
  ]);
  if (!set) notFound();

  const canEdit = canRecordFieldData(session);
  const members = scenarios.filter((s) => s.scenarioSet?.id === set.id);
  const others = scenarios.filter((s) => s.scenarioSet?.id !== set.id);
  const outOfWindow = members.filter((s) => s.resultsOutOfWindow);
  const notRun = members.filter((s) => !s.hasResults);
  // What the next run will do, from the year it runs in — the same rule the
  // engine applies.
  const thisYear = new Date().getFullYear();
  const agedYears = Math.max(0, set.baseYear - thisYear);

  return (
    <div>
      <SetBreadcrumb segment={set.id} label={set.name} />
      <PageHeader
        title={set.name}
        description={set.description ?? `Scenarios compared over ${describeWindow(set)}`}
        actions={
          canEdit && (
            <div className="flex items-start gap-2">
              {members.length > 0 && (
                <form action={runScenarioSetAction}>
                  <input type="hidden" name="id" value={set.id} />
                  <RunProgressButton
                    estimate={estimate}
                    label={`Run all ${members.length} scenario${members.length === 1 ? "" : "s"}`}
                    runningLabel="Running the set…"
                    variant={outOfWindow.length + notRun.length > 0 ? "default" : "outline"}
                  />
                </form>
              )}
              <form action={deleteScenarioSetAction}>
                <input type="hidden" name="id" value={set.id} />
                <Button
                  type="submit"
                  size="sm"
                  variant="destructive"
                  title="Deletes the set only. Its scenarios are kept and go back to their own analysis periods."
                >
                  Delete
                </Button>
              </form>
            </div>
          )
        }
      />

      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <ScenarioSetStatusBadge status={set.status} />
        <span className="flex items-start gap-1.5 tabular-nums">
          <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {/* One inline run of text, so it wraps as a sentence rather than as
              separate flex items. */}
          <span>
            Base year <span className="font-medium">{set.baseYear}</span> ·{" "}
            <span className="font-medium">{set.planningPeriodYears}</span>-year planning period (to {endYear(set)})
            {agedYears > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · network aged {agedYears} year{agedYears === 1 ? "" : "s"} from {thisYear} with no work first
              </span>
            )}
          </span>
        </span>
        <span className="text-muted-foreground">
          {formatNumber(members.length)} scenario{members.length === 1 ? "" : "s"}
        </span>
        {canEdit && (
          <ScenarioSetEditor
            key={set.updatedAt.toISOString()}
            memberCount={members.length}
            initial={{
              id: set.id,
              name: set.name,
              description: set.description ?? "",
              baseYear: String(set.baseYear),
              planningPeriodYears: String(set.planningPeriodYears),
              status: set.status,
            }}
          />
        )}
      </div>

      {/* Said before the comparison, because the comparison is exactly what it
          undermines: a chart of scenarios that did not run over the same years
          compares the calendar rather than the choices. */}
      {outOfWindow.length + notRun.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {outOfWindow.length > 0 && (
              <>
                {outOfWindow.map((s) => s.name).join(", ")} {outOfWindow.length === 1 ? "has" : "have"} results for
                different years than {set.baseYear}–{endYear(set)}.{" "}
              </>
            )}
            {notRun.length > 0 && (
              <>
                {notRun.map((s) => s.name).join(", ")} {notRun.length === 1 ? "has" : "have"} not run yet.{" "}
              </>
            )}
            Run all scenarios to bring the set into line.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <CardTitle>
              Scenarios in this set <span className="text-muted-foreground">({members.length})</span>
            </CardTitle>
            {canEdit && (
              <Link
                href={`/scenario-planning/new?set=${set.id}`}
                className="text-sm text-primary hover:underline"
              >
                New scenario in this set
              </Link>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            A scenario belongs to one set at most. Adding one that is already in another set moves it here. Its own
            analysis period is kept, and used again if it leaves.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          {members.length === 0 ? (
            <p className="px-6 pb-2 text-sm text-muted-foreground">No scenarios in this set yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scenario</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead>Own period</TableHead>
                    <TableHead>Results</TableHead>
                    {canEdit && <TableHead className="w-24" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link href={`/scenario-planning/${s.id}`} className="font-medium text-primary hover:underline">
                          {s.name}
                        </Link>
                        {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{s.assumptions.strategy}</TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground tabular-nums"
                        title="What this scenario runs over outside the set. Ignored while it is a member."
                      >
                        {s.ownAnalysisPeriodYears} yr
                        {s.ownAnalysisPeriodYears !== set.planningPeriodYears && " (set overrides)"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {!s.hasResults ? (
                          <span className="text-muted-foreground">Not run</span>
                        ) : s.resultsOutOfWindow ? (
                          <span className="font-medium text-amber-600">
                            {s.conditionSeries[0]?.year}–{s.conditionSeries.at(-1)?.year} · out of window
                          </span>
                        ) : (
                          <span className="tabular-nums">
                            {s.conditionSeries[0]?.year}–{s.conditionSeries.at(-1)?.year}
                          </span>
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <form action={assignScenarioAction}>
                            <input type="hidden" name="scenarioId" value={s.id} />
                            <input type="hidden" name="setId" value="" />
                            <input type="hidden" name="returnTo" value={set.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Remove
                            </Button>
                          </form>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {canEdit && others.length > 0 && (
            <form action={assignScenarioAction} className="flex flex-wrap items-center gap-2 border-t px-6 py-4">
              <input type="hidden" name="setId" value={set.id} />
              <input type="hidden" name="returnTo" value={set.id} />
              <label htmlFor="add-scenario" className="text-sm font-medium">
                Add a scenario
              </label>
              <select
                id="add-scenario"
                name="scenarioId"
                required
                defaultValue=""
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm"
              >
                <option value="" disabled>
                  Choose a scenario…
                </option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.scenarioSet ? ` — moves from ${s.scenarioSet.name}` : ""}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" variant="outline">
                Add to set
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Keyed on membership: the comparison decides which scenarios to plot
          when it mounts, so a scenario added afterwards would otherwise join
          the table but not the chart. */}
      {members.length > 0 && (
        <ScenarioComparison
          key={members.map((s) => s.id).join()}
          scenarios={members}
          bands={bands}
          showSet={false}
        />
      )}
    </div>
  );
}
