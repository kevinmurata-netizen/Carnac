import { CATEGORY_KEYS } from "./category-weight";
import type { TreatmentCategory } from "./treatment";

/**
 * How long work takes to deliver: programmed, funded, built.
 *
 * Today a scenario decides, pays and improves the network in one year. That is
 * true of a leak repair and false of a replacement, which a utility programs
 * years before the money moves and years more before anyone digs. A model that
 * cannot say so cannot answer the question an agency actually asks — *when
 * does the money leave, and when does the network get better?*
 *
 * Offsets are counted from the **programming year**, the year the scenario
 * decides to do the work:
 *
 *   fundOffset  0 = paid for in the year it is decided
 *   buildOffset 0 = built in the year it is decided
 *
 * so Repair 0/0, Rehabilitate 1/4, Renew 2/6 reads as "a renewal decided in
 * 2026 draws its money in 2028 and improves the network in 2032".
 *
 * Nothing here runs a scenario. This is the vocabulary and the arithmetic; the
 * engine that spends against it comes next.
 */

/** A share of a project's cost, in a year offset from the programming year. */
export type CashInstalment = {
  /** Years after the programming year. */
  offset: number;
  /** Per cent of the total cost. The instalments sum to 100. */
  percent: number;
};

export type LeadTime = {
  fundOffset: number;
  buildOffset: number;
  /**
   * How the cost is spread, when it is spread at all.
   *
   * Empty means the usual case: the whole cost in the funding year. A design
   * cost two years before construction is the exception that earns the extra
   * shape, so it is stored only where someone has asked for it.
   */
  cash: CashInstalment[];
};

/** Decided, paid for and built in the same year — how every scenario has
 * always behaved, and what a set with nothing set to it still means. */
export const IMMEDIATE: LeadTime = { fundOffset: 0, buildOffset: 0, cash: [] };

export type LeadTimes = {
  /** Null when nothing was chosen and everything is immediate. */
  id: string | null;
  name: string;
  byCategory: Record<TreatmentCategory, LeadTime>;
  /** Treatments that differ from their category, by treatment name. */
  byTreatment: Record<string, LeadTime>;
};

export const IMMEDIATE_LEAD_TIMES: LeadTimes = {
  id: null,
  name: "No delivery lag (built-in)",
  byCategory: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, IMMEDIATE])) as Record<TreatmentCategory, LeadTime>,
  byTreatment: {},
};

/** What one treatment takes to deliver: its own override, else its category. */
export function leadTimeFor(
  times: LeadTimes,
  treatment: string,
  category: TreatmentCategory
): LeadTime {
  return times.byTreatment[treatment] ?? times.byCategory[category] ?? IMMEDIATE;
}

/** True when a set leaves everything immediate, so a scenario using it would
 * behave exactly as one with no set at all. */
export function isImmediate(times: LeadTimes): boolean {
  const flat = [...Object.values(times.byCategory), ...Object.values(times.byTreatment)];
  return flat.every((l) => l.fundOffset === 0 && l.buildOffset === 0);
}

/**
 * When the money leaves, and how much of it.
 *
 * The instalments are rounded to whole dollars and the largest one absorbs the
 * difference, so the years always add up to the cost. A plan whose years do not
 * sum to its own total is worse than one that is a dollar arbitrary about which
 * year carries the rounding.
 */
export function cashPlan(lead: LeadTime, programYear: number, cost: number): Array<{ year: number; amount: number }> {
  const instalments = lead.cash.length > 0 ? lead.cash : [{ offset: lead.fundOffset, percent: 100 }];
  const amounts = instalments.map((i) => Math.round((cost * i.percent) / 100));
  const drift = Math.round(cost) - amounts.reduce((sum, a) => sum + a, 0);
  if (amounts.length > 0) amounts[amounts.indexOf(Math.max(...amounts))] += drift;
  return instalments.map((i, index) => ({ year: programYear + i.offset, amount: amounts[index] }));
}

/** The year the work improves the network. */
export function buildYear(lead: LeadTime, programYear: number): number {
  return programYear + lead.buildOffset;
}

/** The year work must be decided in to be built in a given year. */
export function programYearFor(lead: LeadTime, wantedBuildYear: number): number {
  return wantedBuildYear - lead.buildOffset;
}

/** A lead time in words, for a list or a dropdown. */
export function describeLeadTime(lead: LeadTime): string {
  if (lead.fundOffset === 0 && lead.buildOffset === 0) return "same year";
  const years = (n: number) => `${n} year${n === 1 ? "" : "s"}`;
  const funded = lead.cash.length > 1 ? `paid over ${lead.cash.length} years` : `funded +${years(lead.fundOffset)}`;
  return `${funded}, built +${years(lead.buildOffset)}`;
}

export const MAX_OFFSET = 30;

/**
 * What a lead time may say.
 *
 * Money after the work is a real thing in construction — retentions, final
 * accounts — but it is not something this model can spend, since a project's
 * effects have already landed by then. So the instalments live between the
 * decision and the build, and anything else is refused rather than silently
 * moved.
 */
export function validateLeadTime(label: string, lead: LeadTime) {
  for (const [what, value] of [
    ["funding", lead.fundOffset],
    ["construction", lead.buildOffset],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_OFFSET) {
      throw new Error(`${label}: the ${what} year must be a whole number of years from 0 to ${MAX_OFFSET}`);
    }
  }
  if (lead.fundOffset > lead.buildOffset) {
    throw new Error(
      `${label}: the money would leave in year +${lead.fundOffset}, after the work is built in year +${lead.buildOffset}. Funding comes first.`
    );
  }

  if (lead.cash.length === 0) return;
  if (lead.cash.length === 1) {
    throw new Error(`${label}: a split needs at least two payments. Leave it out to pay the whole cost in one year.`);
  }
  for (const instalment of lead.cash) {
    if (!Number.isInteger(instalment.offset) || instalment.offset < 0 || instalment.offset > lead.buildOffset) {
      throw new Error(
        `${label}: each payment falls between the year the work is decided and the year it is built — 0 to ${lead.buildOffset}.`
      );
    }
    if (!Number.isFinite(instalment.percent) || instalment.percent <= 0) {
      throw new Error(`${label}: every payment must be more than 0%`);
    }
  }
  const total = lead.cash.reduce((sum, i) => sum + i.percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new Error(`${label}: the payments come to ${Math.round(total)}% of the cost rather than 100%`);
  }
  const years = lead.cash.map((i) => i.offset);
  if (new Set(years).size !== years.length) throw new Error(`${label}: two payments fall in the same year`);
}
