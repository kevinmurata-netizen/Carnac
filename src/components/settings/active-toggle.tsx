"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";

/**
 * The Active/Inactive badge, clickable.
 *
 * It calls the action directly rather than submitting a form: these badges sit
 * inside other forms (the curve editor, the template editor), and a nested
 * <form> is invalid HTML — the inner one gets dropped and the click submits the
 * outer form instead.
 *
 * `readOnly` renders the same badge without the button affordance, so a role
 * that cannot change the setting sees the state without a control that would
 * fail.
 */
export function ActiveToggle({
  id,
  isActive,
  action,
  readOnly = false,
  activeHint,
  inactiveHint,
}: {
  id: string;
  isActive: boolean;
  action: (id: string, next: boolean) => Promise<string>;
  readOnly?: boolean;
  /** Explains what turning it off does, shown on hover. */
  activeHint?: string;
  inactiveHint?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (readOnly) {
    return <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "Active" : "Inactive"}</Badge>;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        aria-pressed={isActive}
        title={isActive ? (activeHint ?? "Click to deactivate") : (inactiveHint ?? "Click to activate")}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await action(id, !isActive);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not change this");
            }
          })
        }
        className="rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        <Badge variant={isActive ? "default" : "secondary"} className="cursor-pointer">
          {pending ? "…" : isActive ? "Active" : "Inactive"}
        </Badge>
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
