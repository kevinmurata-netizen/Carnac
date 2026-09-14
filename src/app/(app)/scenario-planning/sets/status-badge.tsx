import { STATUS_LABELS, type ScenarioSetStatusValue } from "@/lib/scenario-sets";

/** Colour follows what the status asks of the reader: approved is settled,
 * in review wants attention, draft and archived ask nothing. */
const TONE: Record<ScenarioSetStatusValue, string> = {
  DRAFT: "border-border text-muted-foreground",
  IN_REVIEW: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-500",
  APPROVED: "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  ARCHIVED: "border-dashed border-border text-muted-foreground",
};

export function ScenarioSetStatusBadge({ status }: { status: ScenarioSetStatusValue }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
