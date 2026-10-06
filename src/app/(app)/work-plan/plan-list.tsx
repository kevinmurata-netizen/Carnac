"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkDeleteBar, SelectAllCheckbox, useBulkSelection } from "@/components/ui/bulk-delete";
import { formatCurrency, formatNumber } from "@/lib/format";
import { deleteWorkPlansAction, type BulkDeleteState } from "./actions";

const EMPTY: BulkDeleteState = { status: "idle", message: null };

export type PlanRow = {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  scenarioName: string | null;
  isScenarioMirror: boolean;
  itemCount: number;
  totalCost: number;
  /** Why it cannot be deleted — a scenario locks its projects — or null. */
  deleteBlocker: string | null;
};

/**
 * The work plans, with a checkbox on each row for deleting several at once.
 *
 * A plan a scenario locks cannot be deleted — that scenario would run
 * differently without anyone deciding it should — so the confirmation splits
 * the ticked ones into those that will go and those that will stay.
 */
export function PlanList({ plans, canEdit }: { plans: PlanRow[]; canEdit: boolean }) {
  const [state, submit, pending] = useActionState(deleteWorkPlansAction, EMPTY);
  const selection = useBulkSelection(plans, state);
  const { selected } = selection;
  const deletable = selected.filter((p) => p.deleteBlocker == null);
  const locked = selected.filter((p) => p.deleteBlocker != null);
  const d = deletable.length;
  const projects = deletable.reduce((n, p) => n + p.itemCount, 0);
  const mirrors = deletable.filter((p) => p.isScenarioMirror).length;

  return (
    <div>
      {state.status !== "idle" && state.message && (
        <div className="px-4 pt-4">
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

      {canEdit && plans.length > 0 && (
        <BulkDeleteBar
          selection={selection}
          action={submit}
          pending={pending}
          noun="plans"
          onConfirm={d === 0 ? () => {} : undefined}
          title={d === 0 ? "None of these can be deleted" : `Delete ${d} work plan${d === 1 ? "" : "s"}?`}
          confirmLabel={d === 0 ? "OK" : `Delete ${d} plan${d === 1 ? "" : "s"}`}
          description={
            <div className="space-y-2">
              {d > 0 && (
                <p>
                  <span className="font-medium text-foreground">{deletable.map((p) => p.name).join(", ")}</span>{" "}
                  {d === 1 ? "is" : "are"} deleted with {d === 1 ? "its" : "their"} {formatNumber(projects)} project
                  {projects === 1 ? "" : "s"}. This cannot be undone.
                  {mirrors > 0 &&
                    ` A scenario run's own record comes back the next time that scenario runs; a plan made from a scenario does not.`}
                </p>
              )}
              {locked.length > 0 && (
                <div className="text-amber-700 dark:text-amber-500">
                  <p>
                    {locked.length === 1 ? "This one is" : `These ${locked.length} are`} locked by a scenario and will
                    be kept:
                  </p>
                  <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                    {locked.map((p) => (
                      <li key={p.id}>
                        <span className="font-medium">{p.name}</span>: {p.deleteBlocker}
                      </li>
                    ))}
                  </ul>
                </div>
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
                    rowCount={plans.length}
                    disabled={pending}
                    label="Select all work plans"
                  />
                </TableHead>
              )}
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
                <TableCell colSpan={canEdit ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">
                  No work plans yet — start one below.
                </TableCell>
              </TableRow>
            )}
            {plans.map((p) => {
              const checked = selection.isPicked(p.id);
              return (
                <TableRow key={p.id} className={checked ? "bg-muted/40" : undefined}>
                  {canEdit && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary align-middle"
                        aria-label={`Select ${p.name}`}
                        checked={checked}
                        disabled={pending}
                        onChange={() => selection.toggle(p.id)}
                      />
                    </TableCell>
                  )}
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
                    {p.deleteBlocker && (
                      <span className="ml-1.5 rounded border px-1.5 py-0.5 text-[10px]" title={p.deleteBlocker}>
                        locked by a scenario
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{formatNumber(p.itemCount)}</TableCell>
                  <TableCell>{formatCurrency(p.totalCost, { compact: true })}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
