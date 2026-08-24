import { prisma } from "@/lib/prisma";
import { getConditionBand } from "@/domain/waterline/condition";
import { runScenario } from "@/domain/waterline/scenario";
import { buildSimAssets, listScenarios } from "@/server/scenarios";
import { loadTreatmentDefs } from "@/server/treatment-config";
import { getConditionBands } from "@/server/settings";

/**
 * Where the network ends up, as a flow rather than an average.
 *
 * A scenario's stored results are yearly aggregates — they say the average WCI
 * finished at 73.7, but not that 41 segments climbed out of Very Poor while 12
 * slipped from Good to Fair. This re-runs the simulation to recover each
 * asset's start and end condition and buckets both into the configured bands.
 *
 * It runs live rather than reading stored results because per-asset outcomes
 * were never persisted, and because running against current configuration is
 * what makes the answer trustworthy after a curve or treatment has been edited.
 */

export type WciFlowNode = {
  /** Stable key: "start:Good" / "end:Fair". */
  id: string;
  label: string;
  band: string;
  side: "start" | "end";
  color: string;
  count: number;
};

export type WciFlowLink = {
  source: number;
  target: number;
  value: number;
  fromBand: string;
  toBand: string;
  /** Whether this flow improved, held, or lost ground. */
  direction: "improved" | "unchanged" | "declined";
};

export type WciFlow = {
  scenarioId: string;
  scenarioName: string;
  strategy: string;
  years: number;
  assetCount: number;
  startAvg: number;
  endAvg: number;
  improved: number;
  unchanged: number;
  declined: number;
  treatedCount: number;
  untreatedCount: number;
  nodes: WciFlowNode[];
  links: WciFlowLink[];
};

export async function listScenarioOptions(organizationId: string) {
  const scenarios = await listScenarios(organizationId);
  return scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    strategy: s.assumptions.strategy,
    years: s.assumptions.analysisPeriodYears,
    hasResults: s.hasResults,
  }));
}

export async function getWciFlow(organizationId: string, scenarioId: string): Promise<WciFlow | null> {
  const scenario = await prisma.scenario.findFirst({
    where: { id: scenarioId, organizationId },
    include: { assumptions: true },
  });
  if (!scenario) return null;

  const summaries = await listScenarios(organizationId);
  const summary = summaries.find((s) => s.id === scenarioId);
  if (!summary) return null;

  const [simAssets, library, bands] = await Promise.all([
    buildSimAssets(organizationId),
    loadTreatmentDefs(organizationId),
    getConditionBands(organizationId),
  ]);

  const result = runScenario(simAssets, summary.assumptions, library);
  const outcomes = result.assetOutcomes;
  if (outcomes.length === 0) return null;

  // Bands run best-first; keeping that order on both sides means the diagram
  // reads top-to-bottom as best-to-worst rather than by traffic volume.
  const ordered = [...bands].sort((a, b) => b.min - a.min);
  const rank = new Map(ordered.map((b, i) => [b.label, i]));

  const nodes: WciFlowNode[] = [
    ...ordered.map((b) => ({
      id: `start:${b.label}`,
      label: `Start: ${b.label}`,
      band: b.label,
      side: "start" as const,
      color: b.color,
      count: 0,
    })),
    ...ordered.map((b) => ({
      id: `end:${b.label}`,
      label: `End: ${b.label}`,
      band: b.label,
      side: "end" as const,
      color: b.color,
      count: 0,
    })),
  ];
  const indexOf = new Map(nodes.map((n, i) => [n.id, i]));

  const pairs = new Map<string, number>();
  for (const o of outcomes) {
    const from = getConditionBand(o.startCondition, bands).label;
    const to = getConditionBand(o.endCondition, bands).label;
    pairs.set(`${from}→${to}`, (pairs.get(`${from}→${to}`) ?? 0) + 1);
    nodes[indexOf.get(`start:${from}`)!].count++;
    nodes[indexOf.get(`end:${to}`)!].count++;
  }

  const links: WciFlowLink[] = [...pairs.entries()]
    .map(([key, value]) => {
      const [fromBand, toBand] = key.split("→");
      // A lower rank index is a better band, so moving to a smaller index is an
      // improvement.
      const delta = (rank.get(fromBand) ?? 0) - (rank.get(toBand) ?? 0);
      return {
        source: indexOf.get(`start:${fromBand}`)!,
        target: indexOf.get(`end:${toBand}`)!,
        value,
        fromBand,
        toBand,
        direction: delta > 0 ? ("improved" as const) : delta < 0 ? ("declined" as const) : ("unchanged" as const),
      };
    })
    .sort((a, b) => b.value - a.value);

  const avg = (pick: (o: (typeof outcomes)[number]) => number) =>
    Math.round((outcomes.reduce((s, o) => s + pick(o), 0) / outcomes.length) * 10) / 10;

  return {
    scenarioId,
    scenarioName: scenario.name,
    strategy: summary.assumptions.strategy,
    years: summary.assumptions.analysisPeriodYears,
    assetCount: outcomes.length,
    startAvg: avg((o) => o.startCondition),
    endAvg: avg((o) => o.endCondition),
    improved: links.filter((l) => l.direction === "improved").reduce((s, l) => s + l.value, 0),
    unchanged: links.filter((l) => l.direction === "unchanged").reduce((s, l) => s + l.value, 0),
    declined: links.filter((l) => l.direction === "declined").reduce((s, l) => s + l.value, 0),
    treatedCount: outcomes.filter((o) => o.treatments > 0).length,
    untreatedCount: outcomes.filter((o) => o.treatments === 0).length,
    // Bands nothing passes through would render as slivers with no meaning.
    nodes: nodes.map((n) => ({ ...n })),
    links,
  };
}
