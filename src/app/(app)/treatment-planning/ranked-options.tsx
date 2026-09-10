import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { PriorityRanking } from "@/server/priority";
import type { TreatmentCategory } from "@/domain/waterline/treatment";
import { ExportButton } from "@/components/layout/export-button";

const CATEGORY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Assess: "secondary",
  Repair: "outline",
  Rehabilitate: "default",
  Renew: "destructive",
  Retire: "secondary",
};

const SHOWN = 25;
/** The window the mix is measured over. Long enough to be a real program,
 * short enough that it is the part of the ranking anyone would fund. */
const MIX_WINDOW = 100;

/**
 * Every treatment option on every asset, ranked by Priority Score.
 *
 * The mix strip above the table is not decoration. Dividing by total cost makes
 * the ranking sensitive to how much cost varies between categories, which on a
 * real network is far more than benefit varies — so the top of the list can be
 * a single category without anything being wrong with the data. That is worth
 * seeing before reading the rows, because it changes what the rows mean: a list
 * of a hundred patches is a statement about cost spread, not about the network.
 */
export function RankedOptions({ ranking }: { ranking: PriorityRanking }) {
  // The mix and the table both read the fundable list. An option the
  // effectiveness floor rules out is still scored and still findable, but
  // showing it at the top would suggest it is on the table when it is not.
  const fundable = ranking.rows.filter((r) => r.eligible);
  const top = fundable.slice(0, SHOWN);
  const window = fundable.slice(0, MIX_WINDOW);

  const mix = new Map<TreatmentCategory, { count: number; cost: number }>();
  for (const row of window) {
    const entry = mix.get(row.category) ?? { count: 0, cost: 0 };
    entry.count += 1;
    entry.cost += row.totalCost;
    mix.set(row.category, entry);
  }
  const mixRows = [...mix.entries()].sort((a, b) => b[1].count - a[1].count);
  const dominant = mixRows[0];
  const concentrated = dominant != null && dominant[1].count >= window.length * 0.9;

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle>
            Ranked Options <span className="text-muted-foreground">({formatNumber(ranking.optionsScored)})</span>
          </CardTitle>
          <ExportButton
            href="/treatment-planning/export?list=ranked"
            title={`All ${formatNumber(ranking.optionsScored)} options, including the ${formatNumber(
              ranking.belowFloor
            )} the effectiveness floor rules out`}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Every applicable treatment and combination on every segment, scored as criticality × scale × category ×
          benefit ÷ total cost. {formatNumber(ranking.combinationsScored)} of them are combinations.
        </p>
        <p className="text-xs text-muted-foreground">
          Ranked by <span className="font-medium">{ranking.weightSetName}</span> ·{" "}
          <span className="font-medium">{ranking.categoryWeightSetName}</span> · scale factor{" "}
          <span className="font-medium">{ranking.scaleFactorName ?? "none active"}</span>
          {ranking.scaleFactorFallbacks > 0 && (
            <>
              {" "}
              · {formatNumber(ranking.scaleFactorFallbacks)}{" "}
              {ranking.scaleFactorFallbacks === 1 ? "asset fell" : "assets fell"} back to a factor of 1
            </>
          )}
          {ranking.unpriced > 0 && <> · {formatNumber(ranking.unpriced)} could not be priced</>}
        </p>
        {ranking.belowFloor > 0 && (
          <p className="text-xs text-muted-foreground">
            {formatNumber(ranking.belowFloor)} options are not shown: on a segment below WCI{" "}
            {ranking.floor.conditionBelow} they would cut risk by less than {ranking.floor.minRiskReductionPct}%, which
            leaves a failing main failing whatever they score per dollar. They stay visible on the segment&apos;s own
            page as alternatives.
          </p>
        )}
      </CardHeader>

      <CardContent className="border-t pt-4">
        <div className="mb-4">
          <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">
            What the top {formatNumber(window.length)} is made of
          </h4>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {mixRows.map(([category, entry]) => (
              <span key={category} className="flex items-center gap-1.5">
                <Badge variant={CATEGORY_VARIANT[category] ?? "default"}>{category}</Badge>
                <span className="tabular-nums">{entry.count}</span>
                <span className="text-xs text-muted-foreground">{formatCurrency(entry.cost, { compact: true })}</span>
              </span>
            ))}
          </div>

          {concentrated && (
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
              {dominant[1].count} of the top {window.length} are {dominant[0]}. Dividing by total cost rewards whatever
              is cheapest per point of benefit, and cost varies far more across categories than benefit does — so this
              is the cost spread showing through, not a finding about the network. Reordering cannot fix it, because
              the preference is real: cheap work genuinely does remove more risk per dollar, it just never renews
              anything. What fixes it is a budget cap, set per category on the scenario&apos;s{" "}
              <Link href="/settings/scenario-weights" className="underline">
                category weighting
              </Link>{" "}
              — a ceiling on how much of a year each category may take, with renewal usually left at 100% so it
              absorbs whatever the capped categories leave.
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Segment</TableHead>
                <TableHead>Option</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Benefit</TableHead>
                <TableHead className="text-right">Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((row, i) => (
                <TableRow key={`${row.assetId}:${row.optionId}`}>
                  <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <Link
                      href={`/assets/${row.assetId}?tab=treatments`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.assetCode}
                    </Link>
                    {row.conditionScore != null && (
                      <span className="ml-1.5 text-xs text-muted-foreground">WCI {row.conditionScore}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{row.optionLabel}</span>
                    {row.isCombination && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{row.members.join(" + ")}</span>
                    )}
                    {row.isRecommended && (
                      <span
                        className="ml-1.5 text-xs text-muted-foreground"
                        title="This is also what the segment's own recommendation picks, on its separate risk-reduction-per-dollar basis with the professional overrides applied."
                      >
                        · recommended
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={CATEGORY_VARIANT[row.category] ?? "default"}>{row.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.totalCost)}</TableCell>
                  <TableCell
                    className="text-right tabular-nums"
                    title={`Condition +${Math.round(row.benefitTerms.conditionImprovement)} WCI · Risk −${
                      Math.round(row.benefitTerms.riskReduction * 10) / 10
                    } pts (criticality excluded) · Life-cycle saving ${formatCurrency(
                      row.benefitTerms.lifeCycleSaving
                    )}`}
                  >
                    {row.expectedBenefit}
                  </TableCell>
                  <TableCell
                    className="text-right font-medium tabular-nums"
                    title={
                      row.priority == null
                        ? "No priority score — this option could not be priced, so there is nothing to divide by."
                        : `criticality ${Math.round(row.criticality * 10) / 10} × scale ${
                            Math.round(row.scaleFactor * 100) / 100
                          }${row.categoryWeight === 1 ? "" : ` × category ×${row.categoryWeight}`} × benefit ${
                            row.expectedBenefit
                          } ÷ ${formatCurrency(row.totalCost)}`
                    }
                  >
                    {row.priority ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {fundable.length > top.length && (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Showing the {top.length} highest-scoring of {formatNumber(fundable.length)} fundable options across{" "}
            {formatNumber(ranking.assetsWithOptions)} segments. Choosing which of these a scenario actually considers,
            and fitting them to a budget, is what Scenario Planning does with them.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
