import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getScenarioAlternatives } from "@/server/scenario-alternatives";
import { PageHeader } from "@/components/layout/page-header";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/layout/export-button";
import { formatCurrency, formatNumber } from "@/lib/format";
import { outcomeLegend } from "@/domain/waterline/alternative-reasons";
import { AlternativesGrid } from "./alternatives-grid";

/**
 * Every option the run weighed — one year across the network, or one segment
 * across every year.
 *
 * The scenario's own page says what was funded. This says what else was on the
 * table and why it was not, which is the question anyone challenging a plan
 * actually asks and the one a list of funded projects cannot answer.
 *
 * A year at a time because the run compounds: 2028's options are built from
 * the network 2027 left behind, so the same option on the same segment scores
 * differently each year. All years is offered for one segment at a time, where
 * that compounding is the whole point — when was this picked, when was it not,
 * and what had changed by then — and where a hundred rows can be read. The
 * whole run at once is twenty thousand rows, which is what the file is for.
 */
export default async function AlternativesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; asset?: string }>;
}) {
  const { id } = await params;
  const { year: yearParam, asset: assetParam } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const data = await getScenarioAlternatives(organizationId, id, {
    year: yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined,
    allYears: yearParam === "all",
    assetId: assetParam && /^[A-Za-z0-9_-]{1,64}$/.test(assetParam) ? assetParam : undefined,
  });
  if (!data) notFound();

  const { summary, segment } = data;
  const allYears = data.year === "all";
  // Asked for every year without saying which segment: the picker below is the
  // answer, and the table waits.
  const needsSegment = yearParam === "all" && !segment;
  const base = `/scenario-planning/${id}/alternatives`;
  const exportQuery = allYears ? `year=all&asset=${segment!.id}` : `year=${data.year}`;

  return (
    <div>
      <SetBreadcrumb segment={id} label={data.scenarioName} />
      <PageHeader
        title={`Alternatives — ${data.scenarioName}`}
        description="Every treatment and combination the run considered, in Priority Score order, with what happened to it"
        actions={
          <div className="flex items-center gap-2">
            {!needsSegment && (
              <ExportButton
                href={`${base}/export?${exportQuery}`}
                label={allYears ? `Export ${segment!.code}` : "Export year"}
                title={
                  allYears
                    ? `Every alternative on ${segment!.code}, every year`
                    : `Every alternative considered in ${data.year}`
                }
              />
            )}
            <ExportButton
              href={`${base}/export?year=all`}
              label="Export all years"
              title="Every alternative considered in every year of the run"
            />
          </div>
        }
      />

      <p className="-mt-2 mb-4 text-xs text-muted-foreground">
        Worked out by running the scenario again with the current library, so these are the same choices its stored
        results came from.{" "}
        <Link href={`/scenario-planning/${id}`} className="text-primary hover:underline">
          Back to {data.scenarioName}
        </Link>
      </p>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <CardTitle>
              {allYears ? (
                <>
                  {segment!.code}{" "}
                  <span className="font-normal text-muted-foreground">
                    · every year, {data.years[0]}–{data.years.at(-1)}
                  </span>
                </>
              ) : needsSegment ? (
                "Every year, one segment"
              ) : (
                <>
                  {data.year}{" "}
                  <span className="font-normal text-muted-foreground">
                    · year {data.years.indexOf(data.year as number) + 1} of {data.years.length}
                  </span>
                </>
              )}
            </CardTitle>
            {!needsSegment && (
              <p className="text-sm tabular-nums text-muted-foreground">
                {allYears ? (
                  <>
                    funded in {formatNumber(summary.selected)} of {formatNumber(data.years.length)} years ·{" "}
                    {formatNumber(summary.considered)} alternatives weighed
                  </>
                ) : (
                  <>
                    {formatNumber(summary.selected)} funded of {formatNumber(summary.considered)} considered ·{" "}
                    {formatCurrency(summary.spend, { compact: true })} of{" "}
                    {formatCurrency(summary.budget, { compact: true })} spent ·{" "}
                    {formatNumber(summary.segmentsTreated)} of {formatNumber(summary.segments)} segments treated
                  </>
                )}
              </p>
            )}
          </div>

          {/* Every year of the run, with how much each one bought, and the way
              into one segment's whole story. */}
          <div className="flex flex-wrap gap-1.5">
            {data.byYear.map((y) => {
              const current = !allYears && !needsSegment && y.year === data.year;
              return (
                <Link
                  key={y.year}
                  href={`${base}?year=${y.year}`}
                  scroll={false}
                  aria-current={current ? "page" : undefined}
                  title={`${formatNumber(y.selected)} funded of ${formatNumber(y.considered)} considered · ${formatCurrency(y.spend, { compact: true })}`}
                  className={`rounded-md border px-2.5 py-1 text-xs tabular-nums transition-colors ${
                    current
                      ? "border-transparent bg-primary font-medium text-primary-foreground"
                      : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {y.year}
                  <span className="ml-1.5 opacity-70">{formatNumber(y.selected)}</span>
                </Link>
              );
            })}
            <Link
              href={segment ? `${base}?year=all&asset=${segment.id}` : `${base}?year=all`}
              scroll={false}
              aria-current={allYears || needsSegment ? "page" : undefined}
              title="Every alternative on one segment, across every year"
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                allYears || needsSegment
                  ? "border-transparent bg-primary font-medium text-primary-foreground"
                  : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              All years {segment ? `· ${segment.code}` : "· one segment"}
            </Link>
          </div>

          {/* The segment picker, whenever every year is in view: it is both how
              you get here without a segment and how you switch to another. */}
          {(allYears || needsSegment) && (
            <form action={base} method="get" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="year" value="all" />
              <label htmlFor="segment" className="text-sm font-medium">
                Segment
              </label>
              <select
                id="segment"
                name="asset"
                required
                defaultValue={segment?.id ?? ""}
                className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56"
              >
                <option value="" disabled>
                  Choose a segment…
                </option>
                {data.segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" variant="outline">
                Show every year
              </Button>
              <span className="text-xs text-muted-foreground">
                {formatNumber(data.segments.length)} segments the run considered anything on
              </span>
            </form>
          )}
        </CardHeader>

        <CardContent className="border-t pt-4">
          {needsSegment ? (
            <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
              Choose a segment to see every alternative on it, year by year — when it was funded, when it was passed
              over, and what had changed by then. The whole run at once is over twenty thousand rows; that is what
              Export all years is for.
            </p>
          ) : (
            <AlternativesGrid
              /* Remounted when the view changes: the grid decides its default
                 sort and holds its filters in state, and a client-side move
                 between years — or into one segment's whole run — would
                 otherwise keep a sort that no longer makes sense and chips for
                 outcomes this view may not contain. */
              key={allYears ? `all:${segment!.id}` : String(data.year)}
              showYear={allYears}
              allYearsBase={allYears ? undefined : `${base}?year=all&asset=`}
              outcomes={outcomeLegend(new Set(["Selected", ...data.rows.map((r) => r.reason)]))}
              rows={data.rows.map((r) => ({
                year: r.year,
                assetId: r.assetId,
                assetCode: r.assetCode,
                conditionBefore: r.conditionBefore,
                optionLabel: r.optionLabel,
                members: r.members.join(" + "),
                isCombination: r.isCombination,
                category: r.category,
                cost: r.cost,
                benefit: r.benefit,
                priority: r.priority,
                incremental: r.incremental,
                incrementalOver: r.incrementalOver,
                criticality: r.criticality,
                scaleFactor: r.scaleFactor,
                categoryWeight: r.categoryWeight,
                conditionAfter: r.conditionAfter,
                riskBefore: r.riskBefore,
                riskAfter: r.riskAfter,
                selected: r.selected,
                reason: r.reason,
              }))}
            />
          )}

          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            Priority Score is Criticality × Scale Factor × Category Weight × Expected Benefit ÷ Total Cost, computed
            against that year&apos;s condition. The Incremental score is what decides what is bought: each option on a
            segment is scored on the weighted benefit it adds over the next cheaper option worth having, per dollar
            of the extra it costs, and the year buys the best next step anywhere on the network until the money — or
            a category&apos;s share of it — runs out. The cheapest option on a segment scores the same both ways; larger
            ones score lower, and are bought only when what they add is worth it. Expected Benefit is normalized
            across the options considered in a year, so both scores rank options within their own year and are not
            comparable across years. Options ruled out before scoring — locked out by a retreatment interval, or on a
            segment the strategy passed over — have neither score.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
