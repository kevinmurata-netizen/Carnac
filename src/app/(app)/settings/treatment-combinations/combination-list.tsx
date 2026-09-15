"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkDeleteBar, SelectAllCheckbox, useBulkSelection } from "@/components/ui/bulk-delete";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { CombinationSummary } from "@/server/combinations";
import { deleteCombinationsAction, type BulkDeleteState } from "./actions";

export type CombinationListRow = CombinationSummary & {
  /** What mobilizing costs when the combination has not set its own figure —
   * worked out on the server, where the members' rates are. */
  inferredMobilization: number;
};

const EMPTY: BulkDeleteState = { status: "idle", message: null };

/**
 * The combinations, with a checkbox on each row for deleting several at once.
 *
 * Nothing refuses a combination's deletion, so the confirmation's job is
 * different from the treatment library's: not "some of these will be kept"
 * but "these scenarios chose it". A scenario limited to a handful of options
 * loses one without saying so, and that is the thing worth reading before
 * pressing Delete.
 */
export function CombinationList({
  combinations,
  selectedId,
  canEdit,
}: {
  combinations: CombinationListRow[];
  /** The one open in the editor below, highlighted in the list. */
  selectedId: string | null;
  canEdit: boolean;
}) {
  const [state, submit, pending] = useActionState(deleteCombinationsAction, EMPTY);
  const selection = useBulkSelection(combinations, state);
  const { selected } = selection;

  const chosenByScenarios = selected.filter((c) => c.scenarioCount > 0);
  const n = selected.length;

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

      {canEdit && (
        <BulkDeleteBar
          selection={selection}
          action={submit}
          pending={pending}
          noun="combinations"
          title={`Delete ${n} combination${n === 1 ? "" : "s"}?`}
          confirmLabel={`Delete ${n} combination${n === 1 ? "" : "s"}`}
          description={
            <div className="space-y-2">
              <p>
                <span className="font-medium text-foreground">{selected.map((c) => c.name).join(", ")}</span>{" "}
                {n === 1 ? "is" : "are"} deleted. Their treatments stay in the library and are still offered on their
                own. This cannot be undone.
              </p>
              {chosenByScenarios.length > 0 && (
                <p className="text-amber-700 dark:text-amber-500">
                  {chosenByScenarios
                    .map((c) => `${c.name} (${formatNumber(c.scenarioCount)} scenario${c.scenarioCount === 1 ? "" : "s"})`)
                    .join(", ")}{" "}
                  {chosenByScenarios.length === 1 ? "is" : "are"} chosen in scenario option lists, and will quietly drop
                  out of them. Re-run those scenarios afterwards.
                </p>
              )}
              <p>Work plans already generated keep their rows — they record what was decided.</p>
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
                    rowCount={combinations.length}
                    disabled={pending}
                    label="Select all combinations"
                  />
                </TableHead>
              )}
              <TableHead>Combination</TableHead>
              <TableHead>Treatments</TableHead>
              <TableHead className="text-right whitespace-nowrap">Mobilization</TableHead>
              <TableHead>Extra rules</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {combinations.map((c) => {
              const checked = selection.isPicked(c.id);
              return (
                <TableRow
                  key={c.id}
                  className={checked ? "bg-muted/40" : c.id === selectedId ? "bg-muted/50" : undefined}
                >
                  {canEdit && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary align-middle"
                        aria-label={`Select ${c.name}`}
                        checked={checked}
                        disabled={pending}
                        onChange={() => selection.toggle(c.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Link
                      href={`/settings/treatment-combinations?combination=${c.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                    {!c.enabled && <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>}
                    {c.description && <div className="text-xs text-muted-foreground">{c.description}</div>}
                    {c.conflictingResets.length > 1 && (
                      <div className="text-xs text-destructive">
                        {c.conflictingResets.join(" and ")} both reset condition — probably not intended.
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="flex flex-wrap gap-1">
                      {c.members.map((m) => (
                        <Badge key={m.treatmentId} variant={m.required ? "default" : "secondary"}>
                          {m.treatmentName}
                          {m.required ? "" : " (optional)"}
                        </Badge>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">
                    {c.mobilizationCost == null ? (
                      <span
                        className="text-muted-foreground"
                        title="Not set — charged once, at the largest of the members' rates."
                      >
                        {formatCurrency(c.inferredMobilization)}
                        <span className="ml-1 text-xs">inferred</span>
                      </span>
                    ) : (
                      <span title="Set on this combination, replacing the largest of the members' rates.">
                        {formatCurrency(c.mobilizationCost)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.ruleNames.length === 0 ? <span className="text-muted-foreground">none</span> : c.ruleNames.join(", ")}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
