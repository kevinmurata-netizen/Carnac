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
  /** The year `rows` covers. */
  year: number;
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

/** One year's rows, plus enough about the others to move between them.
 * `year` outside the run falls back to the first year. */
export async function getScenarioAlternatives(
  organizationId: string,
  scenarioId: string,
  year?: number
): Promise<ScenarioAlternatives | null> {
  const run = await loadScenarioRun(organizationId, scenarioId);
  if (!run) return null;

  const result = runScenario(run.simAssets, run.assumptions, { ...run.options, trace: true });
  const years = result.years.map((y) => y.year);
  if (years.length === 0) return null;

  const chosen = year != null && years.includes(year) ? year : years[0];
  const rows = result.alternatives
    .filter((a) => a.year === chosen)
    // Priority Score order, highest first, which is the order the year's money
    // was offered to them. Options ruled out before scoring have no score and
    // sit at the end — unknown is not the same as worthless.
    .sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1));

  const yearResult = result.years.find((y) => y.year === chosen)!;
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

/** Every year's rows at once, for the spreadsheet. The page never asks for
 * this: it is the whole run, and nobody scrolls forty thousand rows. */
export async function getAllScenarioAlternatives(
  organizationId: string,
  scenarioId: string
): Promise<{ scenarioName: string; rows: YearAlternative[] } | null> {
  const run = await loadScenarioRun(organizationId, scenarioId);
  if (!run) return null;
  const result = runScenario(run.simAssets, run.assumptions, { ...run.options, trace: true });
  return {
    scenarioName: run.name,
    rows: result.alternatives.sort(
      (a, b) => a.year - b.year || (b.priority ?? -1) - (a.priority ?? -1)
    ),
  };
}
