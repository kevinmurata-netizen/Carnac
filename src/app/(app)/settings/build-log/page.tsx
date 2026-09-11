import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { ENTRIES } from "@/content/build-log";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { getPageName } from "@/server/navigation";
import { BuildLogFilterBar, SORTS, type BuildLogSort } from "./filter-bar";

/** Entries carry a calendar date and no time, so they are read in the same
 * frame formatDate renders them in. */
const parse = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A date input posts `yyyy-mm-dd` or nothing. Anything else came from a
 * hand-edited URL and is ignored rather than allowed to silently empty the
 * page — the entries are plain strings, and an unparseable bound compared
 * against them would exclude everything. */
function readDate(raw: string | undefined): string {
  if (!raw) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(parse(raw).getTime()) ? raw : "";
}

export default async function BuildLogPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; sort?: string }>;
}) {
  const { from: rawFrom, to: rawTo, sort: rawSort } = await searchParams;
  const session = await auth();

  await requireCard("/settings/build-log");
  const pageTitle = await getPageName(session!.user.organizationId, "/settings/build-log", "Build Log");

  const dates = ENTRIES.map((e) => e.date).sort();
  const earliest = dates[0] ?? "";
  const latest = dates[dates.length - 1] ?? "";

  let from = readDate(rawFrom);
  let to = readDate(rawTo);

  // A range entered backwards is a slip, not a request for nothing. Swapping
  // is the reading that gives someone what they meant; refusing would show an
  // empty page and leave them to work out why.
  const reversed = from !== "" && to !== "" && from > to;
  if (reversed) [from, to] = [to, from];

  const sort: BuildLogSort = SORTS.some((s) => s.value === rawSort) ? (rawSort as BuildLogSort) : "newest";
  const filtered = from !== "" || to !== "" || sort !== "newest";

  // ISO dates compare correctly as strings, so no parsing is needed to bound
  // them — and both ends are inclusive, which is what a reader means by "from
  // the 8th to the 10th".
  const matching = ENTRIES.filter((e) => (from === "" || e.date >= from) && (to === "" || e.date <= to));

  // Sorted by date only. Entries sharing a date keep the order they were
  // written in, which is the order they shipped — a stable sort is doing real
  // work here, since several changes a day is normal.
  const shown = [...matching].sort((a, b) => (sort === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));

  const days = new Set(shown.map((e) => e.date)).size;
  const orderLabel = SORTS.find((s) => s.value === sort)!.label.toLowerCase();

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={
          shown.length === ENTRIES.length
            ? `${ENTRIES.length} change${ENTRIES.length === 1 ? "" : "s"} across ${days} day${
                days === 1 ? "" : "s"
              }, ${orderLabel}.`
            : `${shown.length} of ${ENTRIES.length} change${ENTRIES.length === 1 ? "" : "s"}${
                days > 0 ? ` across ${days} day${days === 1 ? "" : "s"}` : ""
              }, ${orderLabel}.`
        }
      />

      <BuildLogFilterBar
        from={from}
        to={to}
        sort={sort}
        earliest={earliest}
        latest={latest}
        filtered={filtered}
      />

      {reversed && (
        <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-500">
          Those dates were the wrong way round, so they have been swapped — showing {from} to {to}.
        </p>
      )}

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing changed between {from || earliest} and {to || latest}.
          </p>
          <Link href="/settings/build-log" className="mt-2 inline-block text-sm text-primary hover:underline">
            Show every change
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((entry, index) => (
            <Card key={`${entry.date}-${entry.pr ?? index}`}>
              <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="text-lg">{entry.title}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{entry.summary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {entry.pr != null && <Badge variant="secondary">#{entry.pr}</Badge>}
                  <span className="text-xs whitespace-nowrap text-muted-foreground">
                    {formatDate(parse(entry.date))}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 border-t pt-4">
                <ul className="ml-4 list-disc space-y-1.5 text-sm">
                  {entry.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>

                {entry.fixes && entry.fixes.length > 0 && (
                  <div className="rounded-md bg-muted/50 px-3 py-2">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Fixed along the way
                    </p>
                    <ul className="mt-1.5 ml-4 list-disc space-y-1 text-sm">
                      {entry.fixes.map((fix) => (
                        <li key={fix}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.note && <p className="text-xs text-muted-foreground">{entry.note}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
