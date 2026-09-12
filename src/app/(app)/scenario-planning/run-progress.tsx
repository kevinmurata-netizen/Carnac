"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { RunEstimate } from "@/server/run-estimate";

/**
 * A submit button that shows how a scenario run is going.
 *
 * The run is one synchronous server action, so nothing reports real progress —
 * the bar is drawn against an estimate measured from previous runs. Two rules
 * follow from that, and they are the point of the component. While the
 * estimate holds, the bar stops at 95%: the run is over when the page
 * navigates, not when the arithmetic runs out. Once the estimate is spent it
 * stops predicting altogether, turns amber and says how long it has actually
 * been waiting.
 *
 * A bar parked at 90% on a fixed timer is the usual approach and it is a lie
 * the reader eventually catches.
 */
export function RunProgressButton({
  estimate,
  label,
  runningLabel = "Running…",
  size = "sm",
  variant,
  form,
  onSubmitStart,
  pending: pendingOverride,
}: {
  estimate: RunEstimate;
  label: string;
  runningLabel?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline";
  /** Submits a form the button does not sit inside, by id. */
  form?: string;
  onSubmitStart?: () => void;
  /**
   * Whether a run is in flight, when the caller knows better than
   * `useFormStatus` does.
   *
   * That hook only reports for a form the button is a descendant of. A button
   * associated by `form=` is not, so it would sit at "not pending" through the
   * entire run and draw no bar at all — the one thing this component exists
   * for.
   */
  pending?: boolean;
}) {
  // Called unconditionally, as hooks must be. Outside a form it simply
  // reports false, which is exactly what the override is then for.
  const status = useFormStatus();
  const pending = pendingOverride ?? status.pending;
  const [elapsed, setElapsed] = useState(0);

  // Reset at render rather than in the effect: React discards this pass and
  // re-renders immediately, and the effect is left doing only what an effect
  // should — running the clock while a run is in flight.
  const [wasPending, setWasPending] = useState(pending);
  if (wasPending !== pending) {
    setWasPending(pending);
    if (!pending) setElapsed(0);
  }

  useEffect(() => {
    if (!pending) return;
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(id);
  }, [pending]);

  const overrun = elapsed > estimate.ms;
  // Capped below the end: the run is finished when the page navigates, not
  // when the arithmetic runs out.
  const pct = overrun ? 100 : Math.min(95, (elapsed / estimate.ms) * 100);
  const remaining = Math.max(0, estimate.ms - elapsed);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="submit"
        size={size}
        variant={variant}
        disabled={pending}
        form={form}
        onClick={onSubmitStart}
      >
        {pending ? runningLabel : label}
      </Button>

      {pending && (
        <div
          className="min-w-[13rem]"
          role="status"
          aria-live="polite"
          aria-label={overrun ? "Still running" : `About ${Math.ceil(remaining / 1000)} seconds remaining`}
        >
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
                overrun ? "animate-pulse bg-amber-500" : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {overrun ? (
              <>Taking longer than the {formatSeconds(estimate.ms)} expected — {formatSeconds(elapsed)} so far.</>
            ) : (
              <>
                About {formatSeconds(remaining)} left
                {estimate.basis === "no history" && " (rough — nothing has run yet)"}
                {estimate.basis === "other scenarios" && " (from other scenarios)"}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function formatSeconds(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
