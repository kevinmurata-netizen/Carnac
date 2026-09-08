"use client";

import { useFormStatus } from "react-dom";
import { CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CancelOrDiscard, useFormDirty } from "@/components/layout/save-actions";
import type { SettingsActionState } from "./state";

/** Submit button plus inline result. Split out so every settings editor gives
 * the same feedback, including the pending state during a save.
 *
 * Also carries the Cancel / Discard changes control. These forms keep their
 * values in the DOM, so what counts as changed is worked out by comparing the
 * form against a snapshot of what it held when it was last saved — an editor
 * holding its values in React state passes `dirty` and `onDiscard` instead. */
export function SaveBar({
  state,
  label = "Save changes",
  hint,
  dirty,
  onDiscard,
}: {
  state: SettingsActionState;
  label?: string;
  hint?: string;
  /** For an editor that tracks its own changes; otherwise read off the form. */
  dirty?: boolean;
  /** Extra work a discard needs beyond resetting the form — putting React
   * state back for a field the DOM does not own. Always runs alongside the
   * form reset, never instead of it. */
  onDiscard?: () => void;
}) {
  const { pending } = useFormStatus();
  const { anchorRef, dirty: formDirty, discard: resetForm } = useFormDirty(state);
  const isDirty = dirty ?? formDirty;
  const discard = () => {
    onDiscard?.();
    resetForm();
  };

  return (
    <div ref={anchorRef} className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div className="min-w-0 text-xs">
        {state.status === "error" && <span className="text-destructive">{state.message}</span>}
        {state.status === "success" && !isDirty && <span className="text-emerald-600">{state.message}</span>}
        {state.status === "idle" && hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isDirty && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
            <CircleDot className="h-3 w-3" />
            Unsaved changes
          </span>
        )}
        <CancelOrDiscard dirty={isDirty} onDiscard={discard} disabled={pending} />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : label}
        </Button>
      </div>
    </div>
  );
}
