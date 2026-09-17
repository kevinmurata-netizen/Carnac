import type { TreatmentCategory } from "./treatment";

/**
 * How much each kind of work is worth relative to the others.
 *
 * The Category Weight term of the Priority Score (docs/TREATMENT-MODEL-REBUILD.md
 * §5.4):
 *
 *   Criticality × Scale Factor × Category Weight × Expected Benefit ÷ Total Cost
 *
 * It is a policy lever, not a measurement. Nothing about a relining says it is
 * worth 1.6 replacements; a utility that has decided to get ahead of its
 * backlog says so. Keeping it a separate multiplier rather than folding it into
 * the benefit score means the decision stays visible: you can read off a plan
 * that renewals were favoured 1.6 to 1, and you can set it back to 1 and see
 * what the model would have chosen on the merits.
 *
 * Deliberately NOT normalized — see the note on ObjectiveWeights, which is.
 * Those four numbers are shares of one ranking, so scaling them all by ten
 * changes nothing and normalizing is the only honest reading. These are
 * multipliers, and 1 has to keep meaning "leave this category where it is".
 */
export type CategoryWeights = Record<TreatmentCategory, number>;

export const CATEGORY_KEYS: TreatmentCategory[] = [
  "Assess",
  "Repair",
  "Rehabilitate",
  "Renew",
  "Retire",
];

/** Every category at 1 — what the ranking did before category weights existed,
 * and what an organization with no sets falls back to. */
export const NEUTRAL_CATEGORY_WEIGHTS: CategoryWeights = {
  Assess: 1,
  Repair: 1,
  Rehabilitate: 1,
  Renew: 1,
  Retire: 1,
};

export const CATEGORY_DESCRIPTIONS: Record<TreatmentCategory, string> = {
  Assess: "Inspection and testing — buys information rather than condition.",
  Repair: "Fix what has failed or is failing, without extending the asset's life much.",
  Rehabilitate: "Restore an existing asset in place — lining, coating, cathodic protection.",
  Renew: "Replace the asset outright, resetting its condition and its clock.",
  Retire: "Take the asset out of service where something else can carry the load.",
};

/**
 * The weight for one category, floored at zero.
 *
 * A negative weight would flip the sign of the whole Priority Score and rank a
 * high-benefit option last, which no one means by "count this less". Zero is
 * allowed and does mean something definite: the option scores nothing and is
 * never funded — an exclusion expressed as a weight.
 */
export function categoryWeight(weights: CategoryWeights, category: TreatmentCategory): number {
  const raw = weights[category];
  if (!Number.isFinite(raw) || raw < 0) return 1;
  return raw;
}

/** Which categories a set switches off entirely, for a UI that should say so
 * out loud rather than leaving someone to notice the empty plan. */
export function excludedCategories(weights: CategoryWeights): TreatmentCategory[] {
  return CATEGORY_KEYS.filter((k) => categoryWeight(weights, k) === 0);
}

/**
 * The most of one year's budget each category may take, as a fraction.
 *
 * A weight decides what ranks first. A cap decides what actually gets paid
 * for, and the two are separate because ranking cannot solve an allocation
 * problem. Dividing benefit by cost hands the top of the list to whatever is
 * cheapest per point of benefit, by roughly the ratio of the cost spread to
 * the benefit spread — on a real water network, 63-fold against 7.5-fold. No
 * weighting closes a gap that size without becoming a fudge factor, and a plan
 * that funds nothing but patches is not a plan.
 *
 * So the ceiling is applied where the money is, not where the ordering is.
 * Work that would breach its category's cap is passed over and stays in the
 * backlog, still ranked, for a year with room.
 */
export type CategoryCaps = Record<TreatmentCategory, number>;

/** No ceiling anywhere — what allocation did before caps existed. */
export const UNCAPPED: CategoryCaps = {
  Assess: 1,
  Repair: 1,
  Rehabilitate: 1,
  Renew: 1,
  Retire: 1,
};

/** Clamped to 0-1. A cap above 100% of the budget says nothing the budget does
 * not already say, and a negative one has no reading at all. */
export function categoryCap(caps: CategoryCaps, category: TreatmentCategory): number {
  const raw = caps[category];
  if (!Number.isFinite(raw) || raw < 0) return 1;
  return Math.min(1, raw);
}

/*
 * There is no ledger here any more. Two allocation loops — the scenario
 * simulation and work plan generation — each watched their spending against a
 * budget and these caps, and a shared `budgetLedger` existed so the rule lived
 * in one place. Both now buy through `./selection.ts`, which holds the year's
 * spending itself because it also has to unwind a segment's previous choice
 * when it is upgraded. The caps reach it as a funding plan; see
 * `./category-funding.ts`, which says the same thing in the same units.
 */

/** Categories this set actually limits, for a UI that should say so plainly. */
export function cappedCategories(caps: CategoryCaps): TreatmentCategory[] {
  return CATEGORY_KEYS.filter((k) => categoryCap(caps, k) < 1);
}
