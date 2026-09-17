"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkDeleteBar, SelectAllCheckbox, useBulkSelection } from "@/components/ui/bulk-delete";
import { formatNumber } from "@/lib/format";
import type { TreatmentAdminRow } from "@/server/treatment-config";
import { bulkTreatmentsAction } from "./actions";
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
    bulkTreatmentsAction,
    EMPTY_TREATMENT_STATE
  );
  const selection = useBulkSelection(treatments, state);
  const { selected } = selection;

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
        <BulkDeleteBar
          selection={selection}
          action={submit}
          pending={pending}
          noun="treatments"
          // Unlike a copied rule or effect, a copied treatment is live at
          // once: it has the original's rules, so it qualifies wherever the
          // original does. Worth a sentence before it happens.
          copy={{
            warning: (
              <div className="space-y-2">
                <p>
                  <span className="font-medium text-foreground">{selected.map((t) => t.name).join(", ")}</span> will
                  be copied with {selected.length === 1 ? "its" : "their"} rules, blocks, prices and effects, named
                  &ldquo;(copy)&rdquo;. Rules and effects are shared, so {selected.length === 1 ? "the copy uses" : "the copies use"}{" "}
                  the same ones.
                </p>
                <p className="text-amber-700 dark:text-amber-500">
                  A copy is offered wherever the original is — in Treatment Planning and in any scenario that considers
                  every treatment — until you change its rules or effects. Scenarios with their own option list are
                  not affected, and work plans are not copied.
                </p>
              </div>
            ),
          }}
          // Nothing deletable: the dialog explains why, and OK just closes it
          // rather than sending a request that can only be refused.
          onConfirm={deletable.length === 0 ? () => {} : undefined}
          title={
            deletable.length === 0
              ? "None of these can be deleted"
              : `Delete ${deletable.length} treatment${deletable.length === 1 ? "" : "s"}?`
          }
          confirmLabel={
            deletable.length === 0 ? "OK" : `Delete ${deletable.length} treatment${deletable.length === 1 ? "" : "s"}`
          }
          description={
            <div className="space-y-2">
              {deletable.length > 0 && (
                <p>
                  <span className="font-medium text-foreground">{deletable.map((t) => t.name).join(", ")}</span> will
                  be removed from the library, with their prices and rules. This cannot be undone.
                </p>
              )}
              {combinationsTouched > 0 && (
                <p>
                  They are also removed from the treatment combinations they belong to (
                  {formatNumber(combinationsTouched)} membership{combinationsTouched === 1 ? "" : "s"}). A combination
                  left with one treatment is no longer offered.
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
                    rowCount={treatments.length}
                    disabled={pending}
                    label="Select all treatments"
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
              const checked = selection.isPicked(t.id);
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
                        onChange={() => selection.toggle(t.id)}
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
