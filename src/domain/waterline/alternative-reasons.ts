import { NOT_RANKED } from "./scenario";
import { NOT_SELECTED, SELECTED } from "./selection";
import { MATERIAL_INTERVENTION_CONDITION, MIN_RISK_REDUCTION_PCT } from "./treatment";

/**
 * What each outcome on the alternatives page means, in a sentence or two.
 *
 * The outcomes themselves stay a few words long so a column of them can be
 * scanned; this is what someone reads when "Below the effectiveness floor"
 * is not self-explanatory. Kept beside the closed sets they describe, and keyed
 * by them, so a new reason without a description fails to compile rather than
 * showing up unexplained.
 *
 * `stage` is where in a year's run the option stopped, which is also the
 * order the run applies them: ruled out before it was scored, scored but
 * screened out on what it would achieve, or ranked and then not bought.
 */
export type OutcomeStage = "selected" | "before-scoring" | "screened" | "not-funded";

export type OutcomeInfo = { stage: OutcomeStage; description: string };

type Reason =
  | (typeof NOT_RANKED)[keyof typeof NOT_RANKED]
  | (typeof NOT_SELECTED)[keyof typeof NOT_SELECTED]
  | typeof SELECTED;

export const OUTCOME_INFO: Record<Reason, OutcomeInfo> = {
  [SELECTED]: {
    stage: "selected",
    description: "Funded this year. The segment's condition and risk in later years start from what this option did.",
  },

  // ---- Ruled out before scoring: no Priority Score ----
  [NOT_RANKED.ineligible]: {
    stage: "before-scoring",
    description:
      "The scenario's strategy was not looking at this segment this year — for example, it was already above the condition target, or outside the condition band the strategy acts on — so none of its options were scored.",
  },
  [NOT_RANKED.notConsidered]: {
    stage: "before-scoring",
    description:
      "The treatment's rules allow it here, but the scenario's option list leaves this treatment or combination out.",
  },
  [NOT_RANKED.notCapital]: {
    stage: "before-scoring",
    description:
      "Assess buys information and Retire is a decision about service, so neither competes for a capital budget in a scenario. Both still appear in Treatment Planning.",
  },
  [NOT_RANKED.renewalOnly]: {
    stage: "before-scoring",
    description: "The scenario's strategy funds renewal only, so repair and rehabilitation options are set aside.",
  },
  [NOT_RANKED.retreatment]: {
    stage: "before-scoring",
    description:
      "The same treatment was done on this segment too recently. It becomes available again once its retreatment interval has passed.",
  },

  // ---- Scored, then screened out on what it would achieve ----
  [NOT_RANKED.tooLittle]: {
    stage: "screened",
    description: `Would neither lift the segment to the scenario's condition target nor cut its risk by at least ${MIN_RISK_REDUCTION_PCT}%. Scored so you can see its value, but not fundable — otherwise cheap, small improvements get bought on the same segment year after year.`,
  },
  [NOT_RANKED.belowFloor]: {
    stage: "screened",
    description: `The segment is below WCI ${MATERIAL_INTERVENTION_CONDITION}, where an option has to cut risk by at least ${MIN_RISK_REDUCTION_PCT}% to be funded. A patch that scores well per dollar but leaves a failing main failing is not bought.`,
  },

  // ---- Ranked, then not bought ----
  [NOT_SELECTED.betterOption]: {
    stage: "not-funded",
    description:
      "Another option on the same segment was funded instead. A segment gets one option a year: options that pay for themselves over their life come first, then a combination, then the highest Priority Score that fits the budget.",
  },
  [NOT_SELECTED.bundle]: {
    stage: "not-funded",
    description:
      "A combination on this segment was funded instead, covering the work in one visit. Bundles are preferred over single treatments, but never over options that pay for themselves when the bundle does not.",
  },
  [NOT_SELECTED.alreadyTreated]: {
    stage: "not-funded",
    description:
      "The segment was already funded this year, by a higher-ranked option or in an earlier category's share of the budget.",
  },
  [NOT_SELECTED.budgetSpent]: {
    stage: "not-funded",
    description:
      "By the time its turn came in Priority Score order, what was left of the year's budget could not cover its cost.",
  },
  [NOT_SELECTED.categoryFull]: {
    stage: "not-funded",
    description:
      "The year still had money, but this category's share under the scenario's funding plan was used up — a limit of the plan, not of the budget.",
  },
  [NOT_SELECTED.unpriced]: {
    stage: "not-funded",
    description: "No price matched this segment, so there is no cost to rank it by. Check the treatment's prices.",
  },
  [NOT_SELECTED.categoryUnfunded]: {
    stage: "not-funded",
    description: "The scenario's funding plan gives this category no share of the budget, so its options never compete.",
  },
};

export const STAGE_LABEL: Record<OutcomeStage, string> = {
  selected: "Funded",
  "before-scoring": "Ruled out before scoring",
  screened: "Scored, but would not achieve enough",
  "not-funded": "Ranked, but not funded",
};

/** What the page's grid needs about one outcome. Plain data, so a server
 * component can hand it over without the grid importing the engine. */
export type OutcomeLegendEntry = OutcomeInfo & { stageLabel: string };

/** Descriptions for the outcomes that actually occur, keyed by outcome. One
 * written by an older version of the engine simply has none. */
export function outcomeLegend(reasons: Iterable<string>): Record<string, OutcomeLegendEntry> {
  const legend: Record<string, OutcomeLegendEntry> = {};
  for (const reason of reasons) {
    const info = (OUTCOME_INFO as Record<string, OutcomeInfo>)[reason];
    if (info) legend[reason] = { ...info, stageLabel: STAGE_LABEL[info.stage] };
  }
  return legend;
}
