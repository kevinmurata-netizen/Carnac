"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { SettingsActionState } from "./state";

/** Submit button plus inline result. Split out so every settings editor gives
 * the same feedback, including the pending state during a save. */
export function SaveBar({
  state,
  label = "Save changes",
  hint,
}: {
  state: SettingsActionState;
  label?: string;
  hint?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div className="min-w-0 text-xs">
        {state.status === "error" && <span className="text-destructive">{state.message}</span>}
        {state.status === "success" && <span className="text-emerald-600">{state.message}</span>}
        {state.status === "idle" && hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      <Button type="submit" disabled={pending} className="shrink-0">
        {pending ? "Saving…" : label}
      </Button>
    </div>
  );
}
