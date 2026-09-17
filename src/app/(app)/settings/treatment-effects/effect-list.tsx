"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkDeleteBar, SelectAllCheckbox, useBulkSelection } from "@/components/ui/bulk-delete";
import type { EffectSummary } from "@/server/effects";
import { bulkEffectsAction, type BulkDeleteState } from "./actions";

const EMPTY: BulkDeleteState = { status: "idle", message: null };

function conditionText(e: EffectSummary): string {
  if (e.conditionMode === "reset") return `resets to ${e.conditionValue}`;
  if (e.conditionMode === "gain") return `+${e.conditionValue}`;
  return "—";
}

/**
 * The effects, with a checkbox on each row for deleting several at once.
 *
 * An effect a treatment uses cannot be deleted — taking it away would change
 * what that treatment does without anyone deciding to — so the confirmation
 * splits the ticked ones into those that will go and those that will stay.
 */
export function EffectList({
  effects,
  selectedId,
  canEdit,
  onOpen,
}: {
  effects: EffectSummary[];
  /** The effect open in the editor, highlighted in the list. */
  selectedId: string | null;
  canEdit: boolean;
  /** Open an effect in the editor. */
  onOpen: (id: string) => void;
}) {
  const [state, submit, pending] = useActionState(bulkEffectsAction, EMPTY);
  const selection = useBulkSelection(effects, state);
  const { selected } = selection;
  const deletable = selected.filter((e) => e.deleteBlocker == null);
  const inUse = selected.filter((e) => e.deleteBlocker != null);
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
          noun="effects"
          copy={{}}
          onConfirm={d === 0 ? () => {} : undefined}
          title={d === 0 ? "None of these can be deleted" : `Delete ${d} effect${d === 1 ? "" : "s"}?`}
          confirmLabel={d === 0 ? "OK" : `Delete ${d} effect${d === 1 ? "" : "s"}`}
          description={
            <div className="space-y-2">
              {d > 0 && (
                <p>
                  <span className="font-medium text-foreground">{deletable.map((e) => e.name).join(", ")}</span>{" "}
                  {d === 1 ? "is" : "are"} not used by any treatment and will be deleted. This cannot be undone.
                </p>
              )}
              {inUse.length > 0 && (
                <div className="text-amber-700 dark:text-amber-500">
                  <p>
                    {inUse.length === 1 ? "This one is" : `These ${inUse.length} are`} still in use and will be kept —
                    deleting {inUse.length === 1 ? "it" : "them"} would change what those treatments do:
                  </p>
                  <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                    {inUse.map((e) => (
                      <li key={e.id}>
                        <span className="font-medium">{e.name}</span> {e.deleteBlocker}
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
                  <SelectAllCheckbox selection={selection} rowCount={effects.length} disabled={pending} label="Select all effects" />
                </TableHead>
              )}
              <TableHead>Effect</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead className="text-right">Failure ×</TableHead>
              <TableHead className="text-right whitespace-nowrap">Life ext.</TableHead>
              <TableHead>Used by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {effects.map((e) => {
              const checked = selection.isPicked(e.id);
              return (
                <TableRow key={e.id} className={checked ? "bg-muted/40" : e.id === selectedId ? "bg-muted/50" : undefined}>
                  {canEdit && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary align-middle"
                        aria-label={`Select ${e.name}`}
                        checked={checked}
                        disabled={pending}
                        onChange={() => selection.toggle(e.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => onOpen(e.id)}
                        className="text-left font-medium text-primary hover:underline"
                      >
                        {e.name}
                      </button>
                    ) : (
                      <span className="font-medium">{e.name}</span>
                    )}
                    {e.description && <div className="text-xs text-muted-foreground">{e.description}</div>}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{conditionText(e)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">×{e.failureProbMultiplier}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {e.expectedLifeExtension > 0 ? `+${e.expectedLifeExtension} yr` : "—"}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words text-sm">
                    {e.usedBy.length === 0 ? <span className="text-muted-foreground">Nothing yet</span> : e.usedBy.join(", ")}
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
