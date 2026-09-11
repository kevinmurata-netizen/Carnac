import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Date bounds and sort order for the build log.
 *
 * A plain GET form, not a client component. The state belongs in the URL for
 * the same reason the Settings tabs' does — a filtered log is something you
 * send someone ("what changed the week of the 8th"), and that has to survive
 * being pasted into a message. Keeping it in the URL also means the page stays
 * server-rendered with no flash of the unfiltered list.
 *
 * The cost is a click on Apply rather than filtering as you type. That is the
 * right trade for a page someone visits to read rather than to operate: no
 * JavaScript has to load before the filter works, and it cannot get into a
 * state the URL does not describe.
 */
export type BuildLogSort = "newest" | "oldest";

export const SORTS: Array<{ value: BuildLogSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

const input =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function BuildLogFilterBar({
  from,
  to,
  sort,
  earliest,
  latest,
  filtered,
}: {
  from: string;
  to: string;
  sort: BuildLogSort;
  /** The range that actually exists, so the inputs cannot ask for a date the
   * log could never have. */
  earliest: string;
  latest: string;
  /** Whether anything is currently narrowing the list, which is what decides
   * if there is anything to clear. */
  filtered: boolean;
}) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="from">From</Label>
        <input
          id="from"
          name="from"
          type="date"
          defaultValue={from}
          min={earliest}
          max={latest}
          className={`${input} w-40`}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="to">To</Label>
        <input
          id="to"
          name="to"
          type="date"
          defaultValue={to}
          min={earliest}
          max={latest}
          className={`${input} w-40`}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sort">Order</Label>
        <select id="sort" name="sort" defaultValue={sort} className={`${input} w-44`}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">
          Apply
        </Button>
        {filtered && (
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            render={<Link href="/settings/build-log">Clear</Link>}
          />
        )}
      </div>

      <p className="w-full text-xs text-muted-foreground">
        Both dates are inclusive. Leave either empty for no bound on that end — the log runs from {earliest} to{" "}
        {latest}.
      </p>
    </form>
  );
}
