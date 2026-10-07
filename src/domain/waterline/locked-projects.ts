// Projects locked into a scenario run from a work plan.
//
// A capital programme is rarely a blank page: some work is committed before
// any model runs — a main under a road being rebuilt next summer, a job out to
// tender. A scenario can name a work plan whose projects it runs with as they
// are. For each one:
//
//  - **Its money is spent in its year.** Either paid first out of that year's
//    budget, leaving the model the rest, or funded on top of it — the scenario
//    says which. Either way it is reported as programmed work, apart from what
//    the annual allocation bought.
//  - **Its treatment is applied in its build year**, to the asset as the run
//    has carried it there — the same effect rule the model's own work uses.
//  - **Its asset is closed to the model from the year it was programmed until
//    the year it is built.** Nothing else is decided, paid for or built on it
//    in between: the asset's future through then is the project's, not the
//    model's to second-guess.
//
// Locked projects are inputs, never re-judged: the model neither cancels nor
// improves on them, which is what "locked" means.

import { effectiveAgeForCondition } from "./deterioration";
import { pofFromCondition, type ScenarioProject, type SimAsset } from "./scenario";
import { findTreatment, projectedConditionOf, type TreatmentDef, type TreatmentOption } from "./treatment";

/** How programmed work counts against a scenario's annual budget. */
export const PROGRAMMED_FUNDING = ["within", "additional"] as const;
export type ProgrammedFunding = (typeof PROGRAMMED_FUNDING)[number];

export const PROGRAMMED_FUNDING_LABELS: Record<ProgrammedFunding, string> = {
  within: "Paid from the annual budget",
  additional: "Funded on top of the annual budget",
};

/** One project from the locked work plan: a single treatment, or a
 * combination's members done as one visit. */
export type LockedProject = {
  /** Stable within a run: the plan item, or the bundle, it came from. */
  key: string;
  assetId: string;
  assetCode: string;
  /** The treatment's name, or the combination's. */
  label: string;
  bundleName: string | null;
  members: Array<{ treatment: string; cost: number }>;
  cost: number;
  /** When it was decided, when its money is spent, and when it is built. */
  programmedYear: number;
  fundedYear: number;
  buildYear: number;
  /** Its status in the plan, carried through to the run's programme. */
  status: string;
};

/**
 * Locked projects by when they spend, lock and build — what an engine asks
 * of them each year.
 */
export function lockSchedule(projects: LockedProject[]) {
  const byAsset = new Map<string, LockedProject[]>();
  for (const p of projects) byAsset.set(p.assetId, [...(byAsset.get(p.assetId) ?? []), p]);

  return {
    projects,
    any: projects.length > 0,
    /** Programmed money spent in a year. */
    spendIn: (year: number) => projects.filter((p) => p.fundedYear === year).reduce((sum, p) => sum + p.cost, 0),
    /** Projects whose money is spent in a year — where the run reports them. */
    fundedIn: (year: number) => projects.filter((p) => p.fundedYear === year),
    /** Projects built in a year, when their effect lands. */
    builtIn: (year: number) => projects.filter((p) => p.buildYear === year),
    /**
     * Whether the model may not touch an asset with work decided in
     * `fromYear` and built in `toYear` — true when that span meets any locked
     * project's programmed-to-built span on the asset.
     */
    blocks: (assetId: string, fromYear: number, toYear: number) =>
      (byAsset.get(assetId) ?? []).some((p) => fromYear <= p.buildYear && toYear >= p.programmedYear),
  };
}

export type LockSchedule = ReturnType<typeof lockSchedule>;

/**
 * Build a locked project into the network: the asset takes the condition its
 * treatment leaves, from wherever the run has carried it by the build year.
 *
 * Returns the option to record in the retreatment history — so the model does
 * not re-line a main the programme just lined — or null where the plan names
 * a treatment the library no longer has, whose effect is then unknown and the
 * asset is left as it stands.
 */
export function buildLocked(
  project: LockedProject,
  asset: SimAsset,
  library: TreatmentDef[],
  record: ScenarioProject
): TreatmentOption | null {
  const defs = project.members.map((m) => findTreatment(library, m.treatment, asset.assetTypeId));
  const known = defs.every((d): d is TreatmentDef => d != null);

  const before = asset.condition;
  const after = known ? projectedConditionOf(defs as TreatmentDef[], before) : before;
  asset.condition = after;
  asset.effectiveAge = effectiveAgeForCondition(asset.curve, after);

  record.conditionBefore = Math.round(before * 10) / 10;
  record.conditionAfter = Math.round(after * 10) / 10;
  record.riskBefore = Math.round(pofFromCondition(before) * asset.cof * 10) / 10;
  record.riskAfter = Math.round(pofFromCondition(after) * asset.cof * 10) / 10;

  if (!known) return null;
  // Enough of an option for the history, which reads only its members.
  return { members: defs as TreatmentDef[] } as TreatmentOption;
}

/**
 * The run's record of a locked project, before it is built: its condition
 * fields are filled in by `buildLocked` in the build year, and stay at the
 * asset's starting condition if that falls past the end of the run.
 */
export function lockedRecord(project: LockedProject, asset: SimAsset, category: string): ScenarioProject {
  const risk = Math.round(pofFromCondition(asset.condition) * asset.cof * 10) / 10;
  return {
    assetId: project.assetId,
    assetCode: project.assetCode,
    treatment: project.label,
    category,
    cost: Math.round(project.cost),
    members: project.members.map((m) => ({ treatment: m.treatment, cost: Math.round(m.cost) })),
    bundleName: project.bundleName,
    conditionBefore: Math.round(asset.condition * 10) / 10,
    conditionAfter: Math.round(asset.condition * 10) / 10,
    riskBefore: risk,
    riskAfter: risk,
    priority: null,
    incremental: null,
    incrementalOver: null,
    criticality: Math.round(asset.criticalityScore * 10) / 10,
    scaleFactor: Math.round(asset.scaleFactor * 100) / 100,
    benefit: 0,
    programmedYear: project.programmedYear,
    fundedYear: project.fundedYear,
    buildYear: project.buildYear,
    cash: [{ year: project.fundedYear, amount: Math.round(project.cost) }],
    supersededTreatment: null,
    locked: { status: project.status },
  };
}
