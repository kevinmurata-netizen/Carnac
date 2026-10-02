/**
 * Rolling component scores up into one asset score.
 *
 * An asset is made of components — a reservoir is a shell, a roof, a floor, a
 * coating system and cathodic protection — each inspected and scored on its
 * own. How those become "the reservoir's condition" has more than one honest
 * answer, so it is a choice: a RollupStrategy, the organization's default or an
 * asset type's own.
 *
 * Both scores roll up the same way: condition (0-100, lower is worse) and risk
 * (1-25, higher is worse). A component with no score yet is left out of that
 * score, and the result says how many were counted — "3 of 5 components" — so
 * a score built on part of an asset never passes for one built on all of it.
 *
 * Pure: no database, no clock. Computed on read from each component's score
 * snapshot, which is what lets a strategy be changed, or previewed, and every
 * asset score follow without any data being entered again.
 */

export const ROLLUP_STRATEGY_TYPES = [
  "WEIGHTED_WORST_CASE",
  "REPLACEMENT_COST_WEIGHTED_AVERAGE",
  "SIMPLE_AVERAGE",
] as const;
export type RollupStrategyType = (typeof ROLLUP_STRATEGY_TYPES)[number];

export const ROLLUP_STRATEGY_LABELS: Record<RollupStrategyType, string> = {
  WEIGHTED_WORST_CASE: "Weighted worst case",
  REPLACEMENT_COST_WEIGHTED_AVERAGE: "Replacement-cost weighted average",
  SIMPLE_AVERAGE: "Simple average",
};

/**
 * A component worth this share of its asset or more governs the worst-case
 * score outright; a smaller one pulls in proportion. A quarter, by default:
 * a failing shell sets the reservoir's score, while failing cathodic
 * protection — a tenth of what the reservoir costs to replace — pulls it 40%
 * of the way. Each worst-case strategy carries its own, set by the user.
 */
export const DEFAULT_FULL_WEIGHT_SHARE = 0.25;

export type RollupConfig = {
  /** WEIGHTED_WORST_CASE only. Between 0 (exclusive) and 1. */
  fullWeightShare?: number;
  /** Relative weight by component type code, overriding every other source
   * of weight when present. */
  weights?: Record<string, number>;
};

export type RollupStrategyInput = { type: RollupStrategyType; config: RollupConfig };

/**
 * The strategies an organization starts with: one of each kind. Weighted worst
 * case is the default because it is the cautious one — a failing part is not
 * averaged away. Read by the server on first use and by the SQL generator for
 * databases this machine can't reach, so the two start identically.
 */
export const DEFAULT_ROLLUP_STRATEGIES: Array<{
  name: string;
  description: string;
  type: RollupStrategyType;
  config: RollupConfig;
  isDefault: boolean;
}> = [
  {
    name: "Weighted worst case",
    description:
      "An asset is as bad as its worst part, to the extent that part matters: the highest-risk component pulls the score toward its own, all the way once it is a large enough share of the asset.",
    type: "WEIGHTED_WORST_CASE",
    config: { fullWeightShare: DEFAULT_FULL_WEIGHT_SHARE },
    isDefault: true,
  },
  {
    name: "Replacement-cost weighted average",
    description: "Every component counted by its share of what the asset costs to replace.",
    type: "REPLACEMENT_COST_WEIGHTED_AVERAGE",
    config: {},
    isDefault: false,
  },
  {
    name: "Simple average",
    description: "Every component counted equally — a baseline to check the others against.",
    type: "SIMPLE_AVERAGE",
    config: {},
    isDefault: false,
  },
];

export type ComponentScore = {
  id: string;
  /** "North Roof Panel", or the component type's name where there is no label. */
  label: string;
  componentTypeCode: string;
  conditionScore: number | null;
  riskScore: number | null;
  replacementCost: number | null;
  /** The asset type's default weight for this component type. */
  defaultCostWeight: number | null;
};

/** Where the shares came from — said on the result, because "weighted by
 * replacement cost" and "weighted by a default guess" are not the same claim. */
export type WeightBasis = "strategy weights" | "replacement cost" | "default weights" | "equal";

export type MetricRollup = {
  /** Null when no component has this score. */
  value: number | null;
  /** How many components this score was built from. */
  counted: number;
};

export type RollupResult = {
  condition: MetricRollup;
  risk: MetricRollup;
  /** Components with at least one score, out of all the asset has. */
  scored: number;
  total: number;
  weightBasis: WeightBasis;
  /** Each counted component's share of the asset, summing to 1. */
  shares: Array<{ componentId: string; label: string; share: number }>;
  /**
   * The component that drove a worst-case score, and how hard it pulled: 1 is
   * outright, 0.4 is 40% of the way from the weighted average to its score.
   * Null for the averages, and for a worst case with nothing scored.
   */
  driver: { componentId: string; label: string; share: number; pull: number } | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function fullWeightShareOf(config: RollupConfig): number {
  const value = config.fullWeightShare;
  return typeof value === "number" && value > 0 && value <= 1 ? value : DEFAULT_FULL_WEIGHT_SHARE;
}

/**
 * Each component's raw weight, and what those weights are based on.
 *
 * A strategy's own weights come first: they are a deliberate policy. Then the
 * components' replacement costs — but only when every counted component has
 * one, since dollars and relative weights cannot be added together. Then the
 * asset type's default weights, on the same all-or-nothing terms. Then equal.
 */
function weightsFor(
  components: ComponentScore[],
  config: RollupConfig
): { basis: WeightBasis; weight: (c: ComponentScore) => number } {
  const overrides = config.weights ?? {};
  if (Object.keys(overrides).length > 0) {
    return {
      basis: "strategy weights",
      weight: (c) => positive(overrides[c.componentTypeCode]) ?? positive(c.defaultCostWeight) ?? 1,
    };
  }
  if (components.length > 0 && components.every((c) => positive(c.replacementCost) != null)) {
    return { basis: "replacement cost", weight: (c) => c.replacementCost! };
  }
  if (components.length > 0 && components.every((c) => positive(c.defaultCostWeight) != null)) {
    return { basis: "default weights", weight: (c) => c.defaultCostWeight! };
  }
  return { basis: "equal", weight: () => 1 };
}

function positive(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

export function rollUp(components: ComponentScore[], strategy: RollupStrategyInput): RollupResult {
  const counted = components.filter((c) => c.conditionScore != null || c.riskScore != null);
  const { basis, weight } = weightsFor(counted, strategy.config);
  const total = counted.reduce((sum, c) => sum + weight(c), 0);
  const shareOf = (c: ComponentScore) => (total > 0 ? weight(c) / total : 0);

  /** One score, over the components that have it, with shares renormalised
   * across just those — a missing roof score must not drag the average toward
   * zero by keeping its weight. */
  const metric = (pick: (c: ComponentScore) => number | null, weighted: boolean) => {
    const having = counted.filter((c) => pick(c) != null);
    if (having.length === 0) return { value: null, counted: 0, share: () => 0 };
    const sum = having.reduce((s, c) => s + (weighted ? weight(c) : 1), 0);
    const share = (c: ComponentScore) => (weighted ? weight(c) : 1) / sum;
    const value = having.reduce((s, c) => s + share(c) * pick(c)!, 0);
    return { value, counted: having.length, share };
  };

  const weighted = strategy.type !== "SIMPLE_AVERAGE";
  const condition = metric((c) => c.conditionScore, weighted);
  const risk = metric((c) => c.riskScore, weighted);

  let driver: RollupResult["driver"] = null;
  let conditionValue = condition.value;
  let riskValue = risk.value;

  if (strategy.type === "WEIGHTED_WORST_CASE" && counted.length > 0) {
    // The highest-risk component drives; on a tie in risk, or with no risk
    // scores at all, the one in the worse condition does. Without the tie
    // rule, a sound shell whose high consequence matched a failed cathodic
    // protection system's risk would drive simply by being listed first, and
    // the asset would read as healthy as its shell.
    const worse = (a: ComponentScore, b: ComponentScore) =>
      (a.conditionScore ?? Infinity) < (b.conditionScore ?? Infinity) ? a : b;
    const worst = counted.reduce((w, c) => {
      if (c.riskScore == null && w.riskScore == null) return worse(c, w) === c ? c : w;
      const cr = c.riskScore ?? -Infinity;
      const wr = w.riskScore ?? -Infinity;
      if (cr !== wr) return cr > wr ? c : w;
      return worse(c, w) === c ? c : w;
    });
    const share = shareOf(worst);
    const pull = Math.min(1, share / fullWeightShareOf(strategy.config));
    driver = { componentId: worst.id, label: worst.label, share: round1(share * 1000) / 1000, pull: round1(pull * 1000) / 1000 };
    if (conditionValue != null && worst.conditionScore != null) {
      conditionValue = conditionValue + (worst.conditionScore - conditionValue) * pull;
    }
    if (riskValue != null && worst.riskScore != null) {
      riskValue = riskValue + (worst.riskScore - riskValue) * pull;
    }
  }

  return {
    condition: { value: conditionValue == null ? null : round1(conditionValue), counted: condition.counted },
    risk: { value: riskValue == null ? null : round1(riskValue), counted: risk.counted },
    scored: counted.length,
    total: components.length,
    weightBasis: strategy.type === "SIMPLE_AVERAGE" ? "equal" : basis,
    shares: counted.map((c) => ({
      componentId: c.id,
      label: c.label,
      share: Math.round((weighted ? shareOf(c) : 1 / counted.length) * 1000) / 1000,
    })),
    driver,
  };
}
