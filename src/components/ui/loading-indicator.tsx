import { Loader2 } from "lucide-react";

/**
 * The page-level "this is working" sign.
 *
 * Fades in after a short delay (see `.appear-after-delay` in globals.css), so
 * a fast load shows nothing and a slow one — a work plan, a scenario, anything
 * that walks the network — shows a spinner and says so in words, which a
 * screen reader announces too.
 */
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="appear-after-delay flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** A spinner sized for a button or a line of text. */
export function InlineSpinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`h-3.5 w-3.5 animate-spin ${className}`} aria-hidden />;
}
