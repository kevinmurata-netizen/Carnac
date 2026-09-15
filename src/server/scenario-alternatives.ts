import { runScenario, type YearAlternative } from "@/domain/waterline/scenario";
import { loadScenarioRun } from "@/server/scenarios";

/**
 * Every alternative a scenario run considered, year by year.
 *
 * Computed live rather than stored. A row per applicable option per segment
 * per year is tens of thousands of rows for one scenario — storing that for
 * every scenario would dwarf the results themselves, and it would be stale the
 * moment a treatment cost changed. Running it on demand costs a few seconds
 * and always describes the current library.
 *
 * It runs from exactly the inputs the scenario's own run uses, so the year a
 * treatment was funded here is the year it was funded there. Which also means
 * the years compound as the simulation does: what 2028 considers depends on
 * what 2027 bought, and on a year of deterioration everywhere it bought
 * nothing.
 */

export type ScenarioAlternatives = {
  scenarioId: string;
  scenarioName: string;
  /** Every year of the run, for the year picker. */
  years: number[];
  /**
   * The year `rows` covers, or "all" for one segment across the whole run —
   * which is how you see when a treatment was picked, when it was not, and
   * what changed in between.
   */
  year: number | "all";
  /** The segment `rows` are scoped to, when they are. Always set in the
   * all-years view, which is only offered one segment at a time. */
  segment: { id: string; code: string } | null;
  /** Every segment the run considered anything on, for choosing one. */
  segments: Array<{ id: string; code: string }>;
  rows: YearAlternative[];
  /** This year's figures, for the line above the table. */
  summary: {
    considered: number;
    selected: number;
    spend: number;
    budget: number;
    segments: number;
    segmentsTreated: number;
  };
  /** Every year, so the picker can say how big each one was. */
  byYear: Array<{ year: number; considered: number; selected: number; spend: number; budget: number }>;
};

/**
 * One year's rows, or one segment's across every year.
 *
 * All years is deliberately per-segment. The whole run is over twenty thousand
 * rows, which is a file rather than a page — but "every alternative on this
 * segment, every year" is about a hundred, and it is the view that answers
 * when something was picked, when it was not, and what had changed by then.
 *
 * A year outside the run falls back to the first.
 */
export async function getScenarioAlternatives(
  organizationId: string,
  scenarioId: string,
  query: { year?: number; allYears?: boolean; assetId?: string } = {}
): Promise<ScenarioAlternatives | null> {
  const run = await loadScenarioRun(organizationId, scenarioId);
  if (!run) return null;

  const result = runScenario(run.simAssets, run.assumptions, { ...run.options, trace: true });
  const years = result.years.map((y) => y.year);
  if (years.length === 0) return null;

  // Segments in code order, which is how anyone looks one up.
  const segments = [
    ...new Map(result.alternatives.map((a) => [a.assetId, { id: a.assetId, code: a.assetCode }])).values(),
  ].sort((a, b) => a.code.localeCompare(b.code));

  const segment = query.assetId ? (segments.find((s) => s.id === query.assetId) ?? null) : null;
  // All years only means anything with a segment to scope it to; without one
  // the page asks for a segment rather than rendering the whole run.
  const allYears = Boolean(query.allYears);
  const chosen: number | "all" =
    allYears && segment ? "all" : query.year != null && years.includes(query.year) ? query.year : years[0];

  const rows = result.alternatives
    .filter((a) => (chosen === "all" ? a.assetId === segment!.id : a.year === chosen))
    .sort((a, b) =>
      // Across years: oldest first, so a segment's story reads downward.
      // Within one year: Priority Score order, the order the year's money was
      // offered to them. Options ruled out before scoring have no score and
      // sit at the end — unknown is not the same as worthless.
      chosen === "all" ? a.year - b.year || (b.priority ?? -1) - (a.priority ?? -1) : (b.priority ?? -1) - (a.priority ?? -1)
    );

  const yearResult = result.years.find((y) => y.year === (chosen === "all" ? years[0] : chosen))!;
  const counts = new Map<number, { considered: number; selected: number }>();
  for (const a of result.alternatives) {
    const entry = counts.get(a.year) ?? { considered: 0, selected: 0 };
    entry.considered += 1;
    if (a.selected) entry.selected += 1;
    counts.set(a.year, entry);
  }

  return {
    scenarioId,
    scenarioName: run.name,
    years,
    year: chosen,
    segment,
    segments,
    rows,
    summary: {
      considered: rows.length,
      selected: rows.filter((r) => r.selected).length,
      spend: yearResult.spend,
      budget: yearResult.budget,
      segments: new Set(rows.map((r) => r.assetId)).size,
      segmentsTreated: yearResult.treatedCount,
    },
    byYear: result.years.map((y) => ({
      year: y.year,
      considered: counts.get(y.year)?.considered ?? 0,
      selected: counts.get(y.year)?.selected ?? 0,
      spend: y.spend,
      budget: y.budget,
    })),
  };
}

/** Every year's rows at once, for the spreadsheet — the whole run, or one
 * segment of it. The page never asks for the whole run: nobody scrolls twenty
 * thousand rows. */
export async function getAllScenarioAlternatives(
  organizationId: string,
  scenarioId: string,
  assetId?: string
): Promise<{ scenarioName: string; segmentCode: string | null; rows: YearAlternative[] } | null> {
  const run = await loadScenarioRun(organizationId, scenarioId);
  if (!run) return null;
  const result = runScenario(run.simAssets, run.assumptions, { ...run.options, trace: true });
  const rows = (assetId ? result.alternatives.filter((a) => a.assetId === assetId) : result.alternatives).sort(
    (a, b) => a.year - b.year || (b.priority ?? -1) - (a.priority ?? -1)
  );
  return {
    scenarioName: run.name,
    segmentCode: assetId ? (rows[0]?.assetCode ?? null) : null,
    rows,
  };
}
