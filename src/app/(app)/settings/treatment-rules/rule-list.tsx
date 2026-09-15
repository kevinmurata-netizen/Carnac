"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkDeleteBar, SelectAllCheckbox, useBulkSelection } from "@/components/ui/bulk-delete";
import type { RuleSummary } from "@/server/rules";
import { deleteRulesAction, type BulkDeleteState } from "./actions";

const EMPTY: BulkDeleteState = { status: "idle", message: null };

/**
 * The rules, with a checkbox on each row for deleting several at once.
 *
 * A rule in use cannot be deleted — removing it would quietly widen what a
 * treatment or combination applies to, or strip the condition that picks a
 * price — so the confirmation splits the ticked rules into those that will go
 * and those that will stay, and says what each kept one is still doing.
 * Select all is therefore safe for clearing out unused rules: everything
 * still in use survives it.
 */
export function RuleList({
  rules,
  selectedId,
  canEdit,
}: {
  rules: RuleSummary[];
  /** The rule open in the editor below, highlighted in the list. */
  selectedId: string | null;
  canEdit: boolean;
}) {
  const [state, submit, pending] = useActionState(deleteRulesAction, EMPTY);
  const selection = useBulkSelection(rules, state);
  const { selected } = selection;

  const deletable = selected.filter((r) => r.deleteBlocker == null);
  const inUse = selected.filter((r) => r.deleteBlocker != null);
  const d = deletable.length;

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
          noun="rules"
          // Nothing deletable: the dialog explains why, and OK only closes it.
          onConfirm={d === 0 ? () => {} : undefined}
          title={d === 0 ? "None of these can be deleted" : `Delete ${d} rule${d === 1 ? "" : "s"}?`}
          confirmLabel={d === 0 ? "OK" : `Delete ${d} rule${d === 1 ? "" : "s"}`}
          description={
            <div className="space-y-2">
              {d > 0 && (
                <p>
                  <span className="font-medium text-foreground">{deletable.map((r) => r.name).join(", ")}</span>{" "}
                  {d === 1 ? "is" : "are"} not used by anything and will be deleted. This cannot be undone.
                </p>
              )}
              {inUse.length > 0 && (
                <div className="text-amber-700 dark:text-amber-500">
                  <p>
                    {inUse.length === 1 ? "This one is" : `These ${inUse.length} are`} still in use and will be kept —
                    deleting {inUse.length === 1 ? "it" : "them"} would quietly change what they apply to:
                  </p>
                  {/* Capped, because Select all on a long list would otherwise
                      push the buttons off the screen. */}
                  <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                    {inUse.map((r) => (
                      <li key={r.id}>
                        <span className="font-medium">{r.name}</span> {r.deleteBlocker}
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
                    rowCount={rules.length}
                    disabled={pending}
                    label="Select all rules"
                  />
                </TableHead>
              )}
              <TableHead>Rule</TableHead>
              <TableHead>Effect</TableHead>
              <TableHead className="min-w-[16rem]">Reads as</TableHead>
              <TableHead>Used by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => {
              const checked = selection.isPicked(r.id);
              const usage = [
                ...r.usedBy,
                ...r.usedByCombinations.map((c) => `${c} (combination)`),
                ...r.usedByRates.map((p) => `${p} (price)`),
              ];
              return (
                <TableRow
                  key={r.id}
                  className={checked ? "bg-muted/40" : r.id === selectedId ? "bg-muted/50" : undefined}
                >
                  {canEdit && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary align-middle"
                        aria-label={`Select ${r.name}`}
                        checked={checked}
                        disabled={pending}
                        onChange={() => selection.toggle(r.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Link
                      href={`/settings/treatment-rules?rule=${r.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.name}
                    </Link>
                    {!r.enabled && <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.effect === "block" ? "destructive" : "secondary"}>
                      {r.effect === "block" ? "Blocks" : "Allows"}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-[16rem] whitespace-normal break-words text-sm text-muted-foreground">
                    {r.summary}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words text-sm">
                    {usage.length === 0 ? <span className="text-muted-foreground">Nothing yet</span> : usage.join(", ")}
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
