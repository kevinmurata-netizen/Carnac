"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { EMPTY_SETTINGS_STATE, type SettingsActionState } from "./state";

/**
 * Runs the risk and criticality model over every asset.
 *
 * Both the risk weights and the criticality formulas take effect "the next
 * time the model runs", and this is the only thing that runs it — so it sits
 * on both of the screens that can change what it reads.
 */
export function RecomputeButton({
  action,
  hint,
}: {
  action: (prev: SettingsActionState, form: FormData) => Promise<SettingsActionState>;
  /** What the caller changed, so the button explains why it is here. */
  hint: string;
}) {
  const [state, dispatch] = useActionState(action, EMPTY_SETTINGS_STATE);

  return (
    <form action={dispatch} className="flex flex-wrap items-center gap-3">
      <Inner hint={hint} state={state} />
    </form>
  );
}

function Inner({ hint, state }: { hint: string; state: SettingsActionState }) {
  const { pending } = useFormStatus();

  return (
    <>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Scoring every asset…" : "Run the model now"}
      </Button>
      <span className="min-w-0 text-xs">
        {state.status === "error" && <span className="text-destructive">{state.message}</span>}
        {state.status === "success" && <span className="text-emerald-600">{state.message}</span>}
        {state.status === "idle" && <span className="text-muted-foreground">{hint}</span>}
      </span>
    </>
  );
}
