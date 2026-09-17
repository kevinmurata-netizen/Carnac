"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Trash2 } from "lucide-react";
import { formatNumber } from "@/lib/format";

/**
 * Ticking rows to delete several at once: the selection, and the bar above
 * the table that acts on it.
 *
 * Shared so every list that offers bulk delete behaves the same way — the
 * same Select all, the same count, the same confirmation — rather than each
 * page reinventing the edge cases below.
 */

/**
 * Which rows are ticked.
 *
 * `rows` is the list as it stands now. Only ids still in it count as
 * selected: after a delete, the rows it removed are gone, and ticks left
 * pointing at them would inflate the count.
 *
 * `resetOn` is the delete action's result. When it changes to anything but
 * idle, the ticks clear — done at render rather than in an effect, so the
 * stale ticks are never painted.
 */
export function useBulkSelection<T extends { id: string }>(rows: T[], resetOn: { status: string }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const [seen, setSeen] = useState(resetOn);
  if (seen !== resetOn) {
    setSeen(resetOn);
    if (resetOn.status !== "idle") setPicked(new Set());
  }

  const selected = useMemo(() => rows.filter((r) => picked.has(r.id)), [rows, picked]);
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const someSelected = selected.length > 0 && !allSelected;

  // "Some but not all" has no attribute, only a DOM property.
  const headerBox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = someSelected;
  }, [someSelected]);

  return {
    selected,
    allSelected,
    headerBox,
    isPicked: (id: string) => picked.has(id),
    toggle: (id: string) =>
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    selectAll: () => setPicked(new Set(rows.map((r) => r.id))),
    clear: () => setPicked(new Set()),
  };
}

export type BulkSelection<T extends { id: string }> = ReturnType<typeof useBulkSelection<T>>;

/**
 * The bar above a table: Select all, the count, Delete selected, and Copy
 * selected where the list offers it.
 *
 * It is a form, and its hidden ids are what the delete action receives, so
 * the action sees exactly the rows ticked on screen. The confirmation's words
 * come from the caller, because only the page knows what deleting its rows
 * takes with it.
 */
export function BulkDeleteBar<T extends { id: string }>({
  selection,
  action,
  pending,
  noun,
  title,
  description,
  confirmLabel,
  onConfirm,
  copy,
}: {
  selection: BulkSelection<T>;
  action: (formData: FormData) => void;
  pending: boolean;
  /** Plural, for the hint: "treatments", "combinations". */
  noun: string;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  /** Set to close the dialog without deleting — for when nothing selected can
   * actually be deleted and the dialog is only explaining why. */
  onConfirm?: () => void;
  /**
   * Offer Copy selected beside Delete selected. It submits the same form with
   * `intent=copy`, so the page's action decides which it was asked for.
   *
   * `warning`, when given, is asked about first — for copies that change
   * something the moment they exist. Without it the copy is made straight
   * away, since a copy nothing uses yet changes nothing.
   */
  copy?: { warning?: ReactNode };
}) {
  const { selected, allSelected, selectAll, clear } = selection;
  const [confirmingCopy, setConfirmingCopy] = useState(false);
  const copySubmit = useRef<HTMLButtonElement>(null);
  const count = selected.length > 0 ? ` (${formatNumber(selected.length)})` : "";

  return (
    <form action={action} className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
      {selected.map((r) => (
        <input key={r.id} type="hidden" name="id" value={r.id} />
      ))}

      <Button type="button" size="sm" variant="outline" onClick={allSelected ? clear : selectAll} disabled={pending}>
        {allSelected ? "Clear selection" : "Select all"}
      </Button>

      <span className="text-sm tabular-nums text-muted-foreground">
        {selected.length === 0
          ? `Tick ${noun} to ${copy ? "copy or delete" : "delete"} several at once`
          : `${formatNumber(selected.length)} selected`}
      </span>

      {selected.length > 0 && !allSelected && (
        <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={pending}>
          Clear
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {copy && (
          <>
            {/* The button that actually submits as a copy. With a warning it
                is pressed by the dialog, not by the person. */}
            <Button
              ref={copySubmit}
              type="submit"
              name="intent"
              value="copy"
              size="sm"
              variant="outline"
              disabled={selected.length === 0 || pending}
              className={copy.warning ? "hidden" : undefined}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy selected{count}
            </Button>
            {copy.warning && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={selected.length === 0 || pending}
                  onClick={() => setConfirmingCopy(true)}
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy selected{count}
                </Button>
                <Dialog open={confirmingCopy} onOpenChange={setConfirmingCopy}>
                  <DialogContent showCloseButton={false}>
                    <DialogHeader>
                      <DialogTitle>
                        Copy {formatNumber(selected.length)} {selected.length === 1 ? noun.replace(/s$/, "") : noun}?
                      </DialogTitle>
                      <DialogDescription render={<div />}>{copy.warning}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setConfirmingCopy(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setConfirmingCopy(false);
                          copySubmit.current?.click();
                        }}
                      >
                        Copy
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </>
        )}
        <ConfirmDelete
          disabled={selected.length === 0}
          pendingLabel="Deleting…"
          onConfirm={onConfirm}
          title={title}
          confirmLabel={confirmLabel}
          description={description}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Delete selected{count}
        </ConfirmDelete>
      </div>
    </form>
  );
}

/** The header checkbox: ticks every row, shows a partial state when some are. */
export function SelectAllCheckbox<T extends { id: string }>({
  selection,
  rowCount,
  disabled,
  label,
}: {
  selection: BulkSelection<T>;
  rowCount: number;
  disabled?: boolean;
  label: string;
}) {
  const { allSelected, headerBox, selectAll, clear } = selection;
  return (
    <input
      ref={headerBox}
      type="checkbox"
      className="h-4 w-4 accent-primary align-middle"
      aria-label={allSelected ? "Clear selection" : label}
      checked={allSelected}
      disabled={disabled || rowCount === 0}
      onChange={allSelected ? clear : selectAll}
    />
  );
}
