import { prisma } from "@/lib/prisma";
import { assumptionsFromRows } from "@/server/scenarios";

/**
 * How long a scenario run is likely to take.
 *
 * A run is one synchronous server action: it cannot report its own progress,
 * so a progress bar has to be drawn against a prediction. The prediction is
 * measured rather than invented — every successful run records its duration —
 * and the UI is expected to say so when reality overruns it rather than
 * pretending the bar knows better.
 *
 * Work scales with the number of assets simulated and the number of years
 * simulated, so those are the units a rate is expressed in.
 */

/**
 * Used only when nothing in the organization has ever run.
 *
 * Measured at 0.32 ms/asset-year locally — a 260-asset, 20-year scenario took
 * 1.67s. Set at roughly double that, because a run against a hosted database
 * pays network latency this measurement did not, and because overshooting is
 * the kinder error: a bar that finishes early is a pleasant surprise, one that
 * overruns looks broken.
 *
 * It matters for exactly one run per organization. Every scenario measures
 * itself the first time it completes, and the fleet rate takes over for the
 * rest.
 */
const FALLBACK_MS_PER_ASSET_YEAR = 0.6;

/** Below this the bar is more distracting than useful. */
export const MIN_ESTIMATE_MS = 1200;

export type RunEstimate = {
  /** Milliseconds the next run is predicted to take. */
  ms: number;
  /** Where the number came from, so the UI can be honest about it. */
  basis: "this scenario" | "other scenarios" | "no history";
};

function unitsFor(assetCount: number, analysisPeriodYears: number): number {
  return Math.max(1, assetCount * Math.max(1, analysisPeriodYears));
}

/**
 * Estimate for one scenario.
 *
 * Prefers this scenario's own last run, which accounts for whatever makes it
 * particular. Falls back to the rate other scenarios achieved — the median,
 * not the mean, so one pathological run does not drag every estimate with it.
 */
export async function estimateRunMs(organizationId: string, scenarioId: string): Promise<RunEstimate> {
  const [scenario, assetCount, others] = await Promise.all([
    prisma.scenario.findFirst({
      where: { id: scenarioId, organizationId },
      include: { assumptions: true },
    }),
    prisma.asset.count({
      where: { organizationId, assetType: { code: "WATERLINE" }, deletedAt: null, status: "ACTIVE" },
    }),
    prisma.scenario.findMany({
      where: { organizationId, lastRunMs: { not: null }, id: { not: scenarioId } },
      include: { assumptions: true },
    }),
  ]);

  if (scenario?.lastRunMs != null) {
    return { ms: Math.max(MIN_ESTIMATE_MS, scenario.lastRunMs), basis: "this scenario" };
  }

  const years = scenario ? assumptionsFromRows(scenario.assumptions).analysisPeriodYears : 20;
  const units = unitsFor(assetCount, years);

  const rates = others
    .map((s) => s.lastRunMs! / unitsFor(assetCount, assumptionsFromRows(s.assumptions).analysisPeriodYears))
    .sort((a, b) => a - b);

  if (rates.length === 0) {
    return { ms: Math.max(MIN_ESTIMATE_MS, Math.round(units * FALLBACK_MS_PER_ASSET_YEAR)), basis: "no history" };
  }

  const median = rates[Math.floor(rates.length / 2)];
  return { ms: Math.max(MIN_ESTIMATE_MS, Math.round(units * median)), basis: "other scenarios" };
}

/** Estimate for a scenario that does not exist yet, on the create page. */
export async function estimateNewRunMs(
  organizationId: string,
  analysisPeriodYears: number
): Promise<RunEstimate> {
  const [assetCount, others] = await Promise.all([
    prisma.asset.count({
      where: { organizationId, assetType: { code: "WATERLINE" }, deletedAt: null, status: "ACTIVE" },
    }),
    prisma.scenario.findMany({
      where: { organizationId, lastRunMs: { not: null } },
      include: { assumptions: true },
    }),
  ]);

  const units = unitsFor(assetCount, analysisPeriodYears);
  const rates = others
    .map((s) => s.lastRunMs! / unitsFor(assetCount, assumptionsFromRows(s.assumptions).analysisPeriodYears))
    .sort((a, b) => a - b);

  if (rates.length === 0) {
    return { ms: Math.max(MIN_ESTIMATE_MS, Math.round(units * FALLBACK_MS_PER_ASSET_YEAR)), basis: "no history" };
  }
  const median = rates[Math.floor(rates.length / 2)];
  return { ms: Math.max(MIN_ESTIMATE_MS, Math.round(units * median)), basis: "other scenarios" };
}
