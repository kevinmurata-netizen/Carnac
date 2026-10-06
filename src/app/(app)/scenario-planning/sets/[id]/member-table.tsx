"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/pending-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkDeleteBar, SelectAllCheckbox, useBulkSelection } from "@/components/ui/bulk-delete";
import { formatNumber } from "@/lib/format";
import {
  assignScenarioAction,
  copyScenarioAction,
  deleteSetScenariosAction,
  type BulkDeleteState,
} from "../actions";

const EMPTY: BulkDeleteState = { status: "idle", message: null };

export type MemberRow = {
  id: string;
  name: string;
  description: string | null;
  strategy: string;
  ownAnalysisPeriodYears: number;
  hasResults: boolean;
  resultsOutOfWindow: boolean;
  firstYear: number | null;
  lastYear: number | null;
  /** Editable work plans made from it, which deleting it keeps. */
  plansMadeFrom: number;
};

/**
 * A set's scenarios, with a checkbox on each row for deleting several at once,
 * and each row's own Move and Copy.
 */
export function MemberTable({
  setId,
  planningPeriodYears,
  members,
  destinations,
  canEdit,
  archived,
}: {
  setId: string;
  planningPeriodYears: number;
  members: MemberRow[];
  destinations: Array<{ id: string; name: string }>;
  canEdit: boolean;
  archived: boolean;
}) {
  const [state, submit, pending] = useActionState(deleteSetScenariosAction, EMPTY);
  const selection = useBulkSelection(members, state);
  const { selected } = selection;
  const n = selected.length;
  const plans = selected.reduce((sum, s) => sum + s.plansMadeFrom, 0);

  return (
    <div>
      {state.status !== "idle" && state.message && (
        <div className="px-4 pb-2">
          <div
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
              state.status === "error"
                ? "border-destructive/40 bg-destructive/5"
                : "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
            }`}
          >
            {state.status === "error" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <span>{state.message}</span>
          </div>
        </div>
      )}

      {canEdit && (
        <BulkDeleteBar
          selection={selection}
          // The bar posts only the ticked ids; which set they were ticked in
          // goes with them, so nothing outside it can be deleted from here.
          action={(formData) => {
            formData.set("setId", setId);
            submit(formData);
          }}
          pending={pending}
          noun="scenarios"
          title={`Delete ${n} scenario${n === 1 ? "" : "s"}?`}
          confirmLabel={`Delete ${n} scenario${n === 1 ? "" : "s"}`}
          description={
            <div className="space-y-2">
              <p>
                <span className="font-medium text-foreground">{selected.map((s) => s.name).join(", ")}</span>{" "}
                {n === 1 ? "is" : "are"} deleted with {n === 1 ? "its" : "their"} assumptions, results and each run&apos;s
                own funded project list. This cannot be undone.
              </p>
              {plans > 0 && (
                <p>
                  {formatNumber(plans)} work plan{plans === 1 ? " was" : "s were"} made from{" "}
                  {n === 1 ? "it" : "them"} under Plan from a scenario. {plans === 1 ? "It is" : "They are"} kept, with
                  every project, and no longer linked to a scenario.
                </p>
              )}
            </div>
          }
        />
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && (
                <TableHead className="w-10">
                  <SelectAllCheckbox
                    selection={selection}
                    rowCount={members.length}
                    disabled={pending}
                    label="Select all scenarios in this set"
                  />
                </TableHead>
              )}
              <TableHead>Scenario</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Own period</TableHead>
              <TableHead>Results</TableHead>
              {canEdit && destinations.length > 0 && <TableHead>Move to</TableHead>}
              {canEdit && !archived && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((s) => {
              const checked = selection.isPicked(s.id);
              return (
                <TableRow key={s.id} className={checked ? "bg-muted/40" : undefined}>
                  {canEdit && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary align-middle"
                        aria-label={`Select ${s.name}`}
                        checked={checked}
                        disabled={pending}
                        onChange={() => selection.toggle(s.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Link href={`/scenario-planning/${s.id}`} className="font-medium text-primary hover:underline">
                      {s.name}
                    </Link>
                    {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{s.strategy}</TableCell>
                  <TableCell
                    className="text-xs text-muted-foreground tabular-nums"
                    title="What this scenario runs over outside the set. Ignored while it is a member."
                  >
                    {s.ownAnalysisPeriodYears} yr
                    {s.ownAnalysisPeriodYears !== planningPeriodYears && " (set overrides)"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {!s.hasResults ? (
                      <span className="text-muted-foreground">Not run</span>
                    ) : s.resultsOutOfWindow ? (
                      <span className="font-medium text-amber-600">
                        {s.firstYear}–{s.lastYear} · out of window
                      </span>
                    ) : (
                      <span className="tabular-nums">
                        {s.firstYear}–{s.lastYear}
                      </span>
                    )}
                  </TableCell>
                  {canEdit && destinations.length > 0 && (
                    <TableCell>
                      <form action={assignScenarioAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="scenarioId" value={s.id} />
                        <select
                          name="setId"
                          required
                          defaultValue=""
                          aria-label={`Move ${s.name} to another set`}
                          className="h-8 max-w-[12rem] rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="" disabled>
                            Another set…
                          </option>
                          {destinations.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" size="sm" variant="ghost">
                          Move
                        </Button>
                      </form>
                    </TableCell>
                  )}
                  {/* A variant beside the original: same window, same
                      settings, then change one thing and run it. */}
                  {canEdit && !archived && (
                    <TableCell>
                      <form action={copyScenarioAction}>
                        <input type="hidden" name="scenarioId" value={s.id} />
                        <SubmitButton
                          size="sm"
                          variant="ghost"
                          pendingLabel="Copying…"
                          title={`Copies ${s.name} into this set, without its results, and opens the copy`}
                        >
                          <Copy className="mr-1 h-3.5 w-3.5" />
                          Copy
                        </SubmitButton>
                      </form>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
