import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getScenarioAlternatives } from "@/server/scenario-alternatives";
import { PageHeader } from "@/components/layout/page-header";
import { SetBreadcrumb } from "@/components/layout/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/layout/export-button";
import { formatCurrency, formatNumber } from "@/lib/format";
import { AlternativesGrid } from "./alternatives-grid";

/**
 * Every option the run weighed, one year at a time.
 *
 * The scenario's own page says what was funded. This says what else was on the
 * table and why it was not — which is the question anyone challenging a plan
 * actually asks, and the one a list of funded projects cannot answer.
 *
 * A year at a time because the run compounds: 2028's options are built from
 * the network 2027 left behind, so the same option on the same segment scores
 * differently each year. Whole-run reading belongs in the spreadsheet.
 */
export default async function AlternativesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { id } = await params;
  const { year: yearParam } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const requested = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;
  const data = await getScenarioAlternatives(organizationId, id, requested);
  if (!data) notFound();

  const { summary } = data;
  const thisYear = data.byYear.find((y) => y.year === data.year)!;

  return (
    <div>
      <SetBreadcrumb segment={id} label={data.scenarioName} />
      <PageHeader
        title={`Alternatives — ${data.scenarioName}`}
        description="Every treatment and combination the run considered each year, in Priority Score order, with what happened to it"
        actions={
          <div className="flex items-center gap-2">
            <ExportButton
              href={`/scenario-planning/${id}/alternatives/export?year=${data.year}`}
              label="Export year"
              title={`Every alternative considered in ${data.year}`}
            />
            <ExportButton
              href={`/scenario-planning/${id}/alternatives/export?year=all`}
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
              {data.year} <span className="font-normal text-muted-foreground">· year {data.years.indexOf(data.year) + 1} of {data.years.length}</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground tabular-nums">
              {formatNumber(summary.selected)} funded of {formatNumber(summary.considered)} considered ·{" "}
              {formatCurrency(thisYear.spend, { compact: true })} of {formatCurrency(thisYear.budget, { compact: true })}{" "}
              spent · {formatNumber(summary.segmentsTreated)} of {formatNumber(summary.segments)} segments treated
            </p>
          </div>

          {/* Every year of the run, with how much each one bought. The counts
              are the point: a year that funded three of nine hundred options
              looks different from one that funded ninety. */}
          <div className="flex flex-wrap gap-1.5">
            {data.byYear.map((y) => {
              const current = y.year === data.year;
              return (
                <Link
                  key={y.year}
                  href={`/scenario-planning/${id}/alternatives?year=${y.year}`}
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
          </div>
        </CardHeader>

        <CardContent className="border-t pt-4">
          <AlternativesGrid
            rows={data.rows.map((r) => ({
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

          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            Priority Score is Criticality × Scale Factor × Category Weight × Expected Benefit ÷ Total Cost, computed
            against this year&apos;s condition. Expected Benefit is normalized across the options considered this year,
            so scores rank options within a year and are not comparable across years. Options ruled out before scoring
            — locked out by a retreatment interval, or on a segment the strategy passed over — have no score.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
