/**
 * What a scenario set is, without the database — so client forms and server
 * validation share one set of bounds and labels.
 */

/** Mirrors the ScenarioSetStatus enum in schema.prisma. */
export const SCENARIO_SET_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "ARCHIVED"] as const;
export type ScenarioSetStatusValue = (typeof SCENARIO_SET_STATUSES)[number];

export const STATUS_LABELS: Record<ScenarioSetStatusValue, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};

/** The period matches a scenario's own analysis period limit, so joining a set
 * can never ask for a run a scenario could not have been configured for. */
export const BASE_YEAR_MIN = 2000;
export const BASE_YEAR_MAX = 2100;
export const PERIOD_MIN = 1;
export const PERIOD_MAX = 50;

export type ScenarioWindow = { baseYear: number; planningPeriodYears: number };

/** The last year a window covers, inclusive. */
export function endYear(w: ScenarioWindow): number {
  return w.baseYear + w.planningPeriodYears - 1;
}

export function describeWindow(w: ScenarioWindow): string {
  return `${w.baseYear}–${endYear(w)} (${w.planningPeriodYears} yr)`;
}

/**
 * Whether stored results cover a different span of years than the scenario
 * would run over now.
 *
 * Derived from the results themselves rather than from timestamps. Changing a
 * set's base year, joining a set, or leaving one all change the window without
 * running anything, and the years already on disk are the only thing that
 * says for certain what the last run covered.
 *
 * A scenario outside any set starts in whatever year it is run, so there is no
 * fixed window to be out of step with and it is never reported here.
 */
export function resultsOutOfWindow(resultYears: number[], window: ScenarioWindow | null): boolean {
  if (!window || resultYears.length === 0) return false;
  return Math.min(...resultYears) !== window.baseYear || Math.max(...resultYears) !== endYear(window);
}
