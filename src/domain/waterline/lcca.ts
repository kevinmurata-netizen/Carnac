// Life-cycle cost analysis (SPEC §14).
//
// The point of this module is to answer "is it cheaper to keep repairing this
// main, or to renew it?" — the question the §32 explainability example asks.
// Comparing today's price tags cannot answer that, because a cheap repair
// leaves a high failure probability that keeps costing money for decades.
//
// All figures are REAL (today's dollars) using a real discount rate, so
// inflation is not applied to future cash flows. Mixing a nominal discount
// rate with real cash flows is the classic LCCA error; keeping everything
// real avoids it. `inflationRate` is carried in the assumptions because the
// spec asks for it and it is used to escalate *unit costs* when a scenario
// prices work in a future year.

export type LccaAssumptions = {
  analysisPeriodYears: number;
  /** Real discount rate, e.g. 0.04 for 4%. */
  discountRate: number;
  /** Real cost escalation above general inflation, e.g. 0.01. */
  inflationRate: number;
};

export const DEFAULT_LCCA_ASSUMPTIONS: LccaAssumptions = {
  analysisPeriodYears: 50,
  discountRate: 0.04,
  inflationRate: 0.01,
};

export function presentValue(amount: number, yearsFromNow: number, discountRate: number): number {
  return amount / Math.pow(1 + discountRate, yearsFromNow);
}

/** PV of a constant amount paid every year from year 1..n. */
export function presentValueOfAnnuity(annualAmount: number, years: number, discountRate: number): number {
  if (annualAmount === 0 || years <= 0) return 0;
  if (discountRate === 0) return annualAmount * years;
  const factor = (1 - Math.pow(1 + discountRate, -years)) / discountRate;
  return annualAmount * factor;
}

/** Equivalent uniform annual cost — spreads an NPV evenly across the period
 * using the capital recovery factor. This is the number that lets you compare
 * options with different service lives on equal footing. */
export function equivalentAnnualCost(npv: number, years: number, discountRate: number): number {
  if (years <= 0) return 0;
  if (discountRate === 0) return npv / years;
  const crf = (discountRate * Math.pow(1 + discountRate, years)) / (Math.pow(1 + discountRate, years) - 1);
  return npv * crf;
}

// Annual probability of at least one failure, by probability-of-failure
// rating (1-5). A transparent lookup rather than a fitted hazard model —
// the spec explicitly prefers explainable models at this stage.
const ANNUAL_FAILURE_PROBABILITY: Record<number, number> = {
  1: 0.005,
  2: 0.012,
  3: 0.028,
  4: 0.06,
  5: 0.12,
};

export function annualFailureProbability(pof: number): number {
  const lower = Math.max(1, Math.min(5, Math.floor(pof)));
  const upper = Math.max(1, Math.min(5, Math.ceil(pof)));
  const frac = pof - lower;
  const a = ANNUAL_FAILURE_PROBABILITY[lower] ?? 0.028;
  const b = ANNUAL_FAILURE_PROBABILITY[upper] ?? a;
  return a + (b - a) * frac;
}

/** Cost of a single in-service failure: emergency repair plus the social /
 * service-interruption cost the spec calls "user/consequence cost". */
export function failureEventCost(input: {
  diameterInches: number | null;
  customersServed: number | null;
}): { repairCost: number; consequenceCost: number; total: number } {
  const diameterFactor = input.diameterInches ? Math.pow(input.diameterInches / 8, 0.7) : 1;
  const repairCost = Math.round(18000 * diameterFactor);
  // Service interruption valued per affected customer, per event.
  const consequenceCost = Math.round((input.customersServed ?? 0) * 145);
  return { repairCost, consequenceCost, total: repairCost + consequenceCost };
}

export type LccaOption = {
  label: string;
  /** Year-0 capital cost. 0 for the do-nothing baseline. */
  initialCost: number;
  /** Recurring annual maintenance once the work is done. */
  annualMaintenanceCost: number;
  /** POF rating 1-5 that applies AFTER the work. */
  resultingPof: number;
  /** Years of service the option delivers before renewal is needed again. */
  serviceLifeYears: number;
  /** Cost to renew when serviceLifeYears is exhausted inside the analysis
   * period. Defaults to initialCost when omitted. */
  renewalCost?: number;
  /**
   * Years over which probability of failure climbs from `resultingPof` to 5.
   * Set for options that do NOT reset the asset's condition — doing nothing,
   * or patching. Without this the analysis assumes a failing main holds
   * today's failure rate for the whole period, which flatters deferral and
   * makes renewal look irrational.
   */
  pofEscalationYears?: number;
  /** Unavoidable replacement once the asset is exhausted. Emergency work
   * carries a premium over the same job done as planned capital. */
  forcedReplacement?: { year: number; cost: number };
};

/** Emergency/reactive work costs more than the same job planned. */
export const EMERGENCY_COST_PREMIUM = 1.4;

export type LccaResult = {
  label: string;
  initialCost: number;
  maintenancePv: number;
  inspectionPv: number;
  failurePv: number;
  renewalPv: number;
  /** PV of an unavoidable replacement forced by running the asset to failure. */
  forcedReplacementPv: number;
  residualValuePv: number;
  /** Total life-cycle cost in present-value terms. */
  totalNpv: number;
  /** Equivalent uniform annual cost. */
  annualizedCost: number;
  undiscountedTotal: number;
  expectedFailures: number;
};

const ANNUAL_INSPECTION_COST_PER_ASSET = 900;

export function computeLcca(
  option: LccaOption,
  asset: { diameterInches: number | null; customersServed: number | null },
  assumptions: LccaAssumptions = DEFAULT_LCCA_ASSUMPTIONS
): LccaResult {
  const { analysisPeriodYears: n, discountRate: r } = assumptions;

  const maintenancePv = presentValueOfAnnuity(option.annualMaintenanceCost, n, r);
  const inspectionPv = presentValueOfAnnuity(ANNUAL_INSPECTION_COST_PER_ASSET, n, r);

  const perFailure = failureEventCost(asset).total;

  // Failure cost year by year, so a deteriorating option's rising failure
  // rate is actually reflected rather than averaged away.
  let failurePv = 0;
  let expectedFailuresRaw = 0;
  for (let t = 1; t <= n; t++) {
    let pof = option.resultingPof;
    if (option.pofEscalationYears && option.pofEscalationYears > 0) {
      const progress = Math.min(1, t / option.pofEscalationYears);
      pof = option.resultingPof + (5 - option.resultingPof) * progress;
    }
    // After a forced replacement the asset is new again.
    if (option.forcedReplacement && t > option.forcedReplacement.year) {
      pof = 1;
    }
    const rate = annualFailureProbability(pof);
    expectedFailuresRaw += rate;
    failurePv += presentValue(rate * perFailure, t, r);
  }
  const expectedFailures = Math.round(expectedFailuresRaw * 100) / 100;

  // Renewal cycles that fall inside the analysis period.
  const renewalCost = option.renewalCost ?? option.initialCost;
  let renewalPv = 0;
  let renewalCount = 0;
  if (option.serviceLifeYears > 0 && renewalCost > 0) {
    for (let year = option.serviceLifeYears; year < n; year += option.serviceLifeYears) {
      renewalPv += presentValue(renewalCost, year, r);
      renewalCount++;
    }
  }

  // Residual value: straight-line remaining worth of the most recent
  // investment at the end of the analysis period, discounted back. Treated
  // as a credit (negative cost).
  let residualValuePv = 0;
  if (option.serviceLifeYears > 0 && option.initialCost > 0) {
    const lastInvestmentYear = renewalCount * option.serviceLifeYears;
    const ageAtEnd = n - lastInvestmentYear;
    const remainingFraction = Math.max(0, 1 - ageAtEnd / option.serviceLifeYears);
    const basis = renewalCount > 0 ? renewalCost : option.initialCost;
    residualValuePv = -presentValue(basis * remainingFraction, n, r);
  }

  // Unavoidable replacement when the asset runs out of life under this option.
  let forcedReplacementPv = 0;
  if (option.forcedReplacement && option.forcedReplacement.year <= n) {
    forcedReplacementPv = presentValue(option.forcedReplacement.cost, option.forcedReplacement.year, r);
  }

  const totalNpv =
    option.initialCost +
    maintenancePv +
    inspectionPv +
    failurePv +
    renewalPv +
    forcedReplacementPv +
    residualValuePv;

  const undiscountedTotal =
    option.initialCost +
    option.annualMaintenanceCost * n +
    ANNUAL_INSPECTION_COST_PER_ASSET * n +
    expectedFailuresRaw * perFailure +
    renewalCost * renewalCount +
    (option.forcedReplacement && option.forcedReplacement.year <= n ? option.forcedReplacement.cost : 0);

  return {
    label: option.label,
    initialCost: Math.round(option.initialCost),
    maintenancePv: Math.round(maintenancePv),
    inspectionPv: Math.round(inspectionPv),
    failurePv: Math.round(failurePv),
    renewalPv: Math.round(renewalPv),
    forcedReplacementPv: Math.round(forcedReplacementPv),
    residualValuePv: Math.round(residualValuePv),
    totalNpv: Math.round(totalNpv),
    annualizedCost: Math.round(equivalentAnnualCost(totalNpv, n, r)),
    undiscountedTotal: Math.round(undiscountedTotal),
    expectedFailures,
  };
}

/** Escalate a present-day unit cost to a future year (real terms). */
export function escalate(amount: number, yearsFromNow: number, inflationRate: number): number {
  return amount * Math.pow(1 + inflationRate, yearsFromNow);
}
