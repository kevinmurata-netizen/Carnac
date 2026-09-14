import Link from "next/link";
import { AlertTriangle, CalendarRange, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { describeWindow } from "@/lib/scenario-sets";
import type { ScenarioSetSummary } from "@/server/scenario-sets";
import type { ScenarioSummary } from "@/server/scenarios";
import { ScenarioSetStatusBadge } from "./status-badge";

/**
 * The scenario sets as cards: the first thing on Scenario Planning.
 *
 * Sets come first, so each card carries the way in to its scenarios — Add
 * Scenario lives here and on the set's page, nowhere else. A card also says
 * the one thing worth knowing before opening it: which of its scenarios ends
 * best, and whether any have results that no longer match the set.
 *
 * Archived sets are listed separately and without an Add button. They are
 * kept for the record, not for new work.
 */
export function ScenarioSetCards({
  sets,
  scenarios,
  canEdit,
}: {
  sets: ScenarioSetSummary[];
  scenarios: ScenarioSummary[];
  canEdit: boolean;
}) {
  const active = sets.filter((s) => s.status !== "ARCHIVED");
  const archived = sets.filter((s) => s.status === "ARCHIVED");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((set) => (
          <SetCard
            key={set.id}
            set={set}
            members={scenarios.filter((s) => s.scenarioSet?.id === set.id)}
            canEdit={canEdit}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <details className="rounded-lg border px-4 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {archived.length} archived set{archived.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 divide-y">
            {archived.map((set) => (
              <li key={set.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/scenario-planning/sets/${set.id}`} className="font-medium text-primary hover:underline">
                  {set.name}
                </Link>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {describeWindow(set)} · {formatNumber(set.scenarioCount)} scenario
                  {set.scenarioCount === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function SetCard({
  set,
  members,
  canEdit,
}: {
  set: ScenarioSetSummary;
  members: ScenarioSummary[];
  canEdit: boolean;
}) {
  const current = members.filter((s) => s.hasResults && !s.resultsOutOfWindow && s.finalAvgCondition != null);
  const best = current.reduce<ScenarioSummary | null>(
    (top, s) => (!top || (s.finalAvgCondition ?? 0) > (top.finalAvgCondition ?? 0) ? s : top),
    null
  );
  const needRunning = members.filter((s) => !s.hasResults || s.resultsOutOfWindow).length;

  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="min-w-0 text-base">
            <Link href={`/scenario-planning/sets/${set.id}`} className="hover:underline">
              {set.name}
            </Link>
          </CardTitle>
          <ScenarioSetStatusBadge status={set.status} />
        </div>
        <p className="flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5 shrink-0" />
          {describeWindow(set)}
        </p>
        {set.description && <p className="line-clamp-2 text-sm text-muted-foreground">{set.description}</p>}
      </CardHeader>

      <CardContent className="flex-1 space-y-2 text-sm">
        {members.length === 0 ? (
          <p className="text-muted-foreground">No scenarios yet.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {members.map((s) => (
                <li key={s.id} className="flex items-baseline justify-between gap-3">
                  <Link href={`/scenario-planning/${s.id}`} className="min-w-0 truncate text-primary hover:underline">
                    {s.name}
                  </Link>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {!s.hasResults
                      ? "not run"
                      : s.resultsOutOfWindow
                        ? "out of window"
                        : `WCI ${s.finalAvgCondition}`}
                  </span>
                </li>
              ))}
            </ul>
            {best && members.length > 1 && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{best.name}</span> ends highest.
              </p>
            )}
            {needRunning > 0 && (
              <p className="flex items-center gap-1 text-xs font-medium text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                {needRunning} need{needRunning === 1 ? "s" : ""} running
              </p>
            )}
          </>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 border-t pt-4">
        <Link href={`/scenario-planning/sets/${set.id}`} className="text-sm text-muted-foreground hover:text-foreground">
          Open set
        </Link>
        {canEdit && (
          <Button
            size="sm"
            nativeButton={false}
            render={
              <Link href={`/scenario-planning/new?set=${set.id}`}>
                <Plus className="mr-1 h-4 w-4" />
                Add Scenario
              </Link>
            }
          />
        )}
      </CardFooter>
    </Card>
  );
}
