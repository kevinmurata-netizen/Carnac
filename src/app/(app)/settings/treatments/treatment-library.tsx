"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { Trash2 } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { TreatmentAdminRow } from "@/server/treatment-config";
import { deleteTreatmentsAction } from "./actions";
import { Feedback } from "./treatment-fields";
import { EMPTY_TREATMENT_STATE, type TreatmentActionState } from "./state";

const CATEGORY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Assess: "secondary",
  Repair: "outline",
  Rehabilitate: "default",
  Renew: "destructive",
  Retire: "secondary",
};

/**
 * The treatment library, with a checkbox on each row for deleting several at
 * once.
 *
 * The checkboxes only appear for a role that can change the library — a
 * reader gets the table exactly as it was, not a column of disabled boxes.
 *
 * Deleting asks first, and the question says what will actually happen: which
 * of the ticked treatments can go, which cannot (a work plan still uses them),
 * and which combinations lose a member. A dialog that only says "are you
 * sure?" gets clicked through; one that names Coating gets read.
 */
export function TreatmentLibrary({
  treatments,
  canEdit,
}: {
  treatments: TreatmentAdminRow[];
  canEdit: boolean;
}) {
  const [state, submit, pending] = useActionState<TreatmentActionState, FormData>(
    deleteTreatmentsAction,
    EMPTY_TREATMENT_STATE
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Only ids still in the list count. After a delete the rows it removed are
  // gone, and ticks left pointing at them would inflate "Delete selected".
  const selected = useMemo(() => treatments.filter((t) => picked.has(t.id)), [treatments, picked]);
  const allSelected = treatments.length > 0 && selected.length === treatments.length;
  const someSelected = selected.length > 0 && !allSelected;

  // A delete that finished clears the ticks. The ones it kept stay listed in
  // the message, which is where the reason is. Done at render, when the result
  // changes, rather than in an effect — React re-renders straight away instead
  // of painting the stale ticks first.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.status !== "idle") setPicked(new Set());
  }

  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // "Some but not all" has no attribute, only a property.
    if (headerBox.current) headerBox.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAll = () => setPicked(new Set(treatments.map((t) => t.id)));
  const clear = () => setPicked(new Set());

  const inUse = selected.filter((t) => t.workPlanItemCount > 0);
  const deletable = selected.filter((t) => t.workPlanItemCount === 0);
  const combinationsTouched = deletable.reduce((n, t) => n + t.combinationCount, 0);

  return (
    <div>
      {state.status !== "idle" && (
        <div className="px-4 pt-4">
          <Feedback state={state} />
        </div>
      )}

      {canEdit && (
        <form action={submit} className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          {selected.map((t) => (
            <input key={t.id} type="hidden" name="id" value={t.id} />
          ))}

          <Button type="button" size="sm" variant="outline" onClick={allSelected ? clear : selectAll} disabled={pending}>
            {allSelected ? "Clear selection" : "Select all"}
          </Button>

          <span className="text-sm text-muted-foreground tabular-nums">
            {selected.length === 0
              ? "Tick treatments to delete several at once"
              : `${formatNumber(selected.length)} selected`}
          </span>

          {selected.length > 0 && !allSelected && (
            <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={pending}>
              Clear
            </Button>
          )}

          <div className="ml-auto">
            <ConfirmDelete
              disabled={selected.length === 0}
              // Nothing deletable: the dialog explains why, and OK just closes
              // it rather than sending a request that can only be refused.
              onConfirm={deletable.length === 0 ? () => {} : undefined}
              pendingLabel="Deleting…"
              title={
                deletable.length === 0
                  ? "None of these can be deleted"
                  : `Delete ${deletable.length} treatment${deletable.length === 1 ? "" : "s"}?`
              }
              confirmLabel={
                deletable.length === 0
                  ? "OK"
                  : `Delete ${deletable.length} treatment${deletable.length === 1 ? "" : "s"}`
              }
              description={
                <div className="space-y-2">
                  {deletable.length > 0 && (
                    <p>
                      <span className="font-medium text-foreground">{deletable.map((t) => t.name).join(", ")}</span>{" "}
                      will be removed from the library, with their prices and rules. This cannot be undone.
                    </p>
                  )}
                  {combinationsTouched > 0 && (
                    <p>
                      They are also removed from the treatment combinations they belong to ({formatNumber(combinationsTouched)}{" "}
                      membership{combinationsTouched === 1 ? "" : "s"}). A combination left with one treatment is no
                      longer offered.
                    </p>
                  )}
                  {inUse.length > 0 && (
                    <p className="text-amber-700 dark:text-amber-500">
                      {inUse.map((t) => t.name).join(", ")} will be kept: work plans still use{" "}
                      {inUse.length === 1 ? "it" : "them"}. Delete or regenerate those plans first.
                    </p>
                  )}
                </div>
              }
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete selected{selected.length > 0 ? ` (${formatNumber(selected.length)})` : ""}
            </ConfirmDelete>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && (
                <TableHead className="w-10">
                  <input
                    ref={headerBox}
                    type="checkbox"
                    className="h-4 w-4 accent-primary align-middle"
                    aria-label={allSelected ? "Clear selection" : "Select all treatments"}
                    checked={allSelected}
                    disabled={pending || treatments.length === 0}
                    onChange={allSelected ? clear : selectAll}
                  />
                </TableHead>
              )}
              <TableHead>Treatment</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Effect</TableHead>
              <TableHead>Rules</TableHead>
              <TableHead>In Plans</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {treatments.map((t) => {
              const checked = picked.has(t.id);
              return (
                <TableRow key={t.id} className={checked ? "bg-muted/40" : undefined}>
                  {canEdit && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary align-middle"
                        aria-label={`Select ${t.name}`}
                        checked={checked}
                        disabled={pending}
                        onChange={() => toggle(t.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Link href={`/settings/treatments/${t.id}`} className="font-medium text-primary hover:underline">
                      {t.name}
                    </Link>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={CATEGORY_VARIANT[t.category] ?? "default"}>{t.category}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.conditionResetTo != null
                      ? `resets to ${t.conditionResetTo}`
                      : t.conditionGain != null
                        ? `+${t.conditionGain}`
                        : "—"}
                    <span className="text-muted-foreground"> · ×{t.failureProbMultiplier}</span>
                  </TableCell>
                  <TableCell>
                    {t.ruleCount > 0 ? (
                      <Badge variant="default">
                        {t.ruleCount} rule{t.ruleCount === 1 ? "" : "s"}
                        {t.blockRuleCount > 0 ? `, ${t.blockRuleCount} blocking` : ""}
                      </Badge>
                    ) : (
                      // Not a neutral "none": with no rules the treatment is
                      // considered for every inspected asset, which is worth
                      // noticing from the list.
                      <span className="text-xs text-destructive">none — considered for everything</span>
                    )}
                  </TableCell>
                  <TableCell>{formatNumber(t.workPlanItemCount)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
