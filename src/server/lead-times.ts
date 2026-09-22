import { prisma } from "@/lib/prisma";
import { CATEGORY_KEYS } from "@/domain/waterline/category-weight";
import {
  IMMEDIATE,
  IMMEDIATE_LEAD_TIMES,
  describeLeadTime,
  isImmediate,
  validateLeadTime,
  type CashInstalment,
  type LeadTime,
  type LeadTimes,
} from "@/domain/waterline/lead-time";
import type { TreatmentCategory } from "@/domain/waterline/treatment";
import { copyName, takenNames } from "@/lib/copy-name";

/**
 * Named sets of delivery lead times.
 *
 * The same shape as the weightings next door — list, default, copy, refuse to
 * delete what is in use — because it answers the same kind of question: not
 * "what is true of this utility" but "what would happen if". A set is chosen
 * on a scenario, which is what lets "renewals take six years" and "renewals
 * take three" be two runs over the same network rather than an edit.
 *
 * Nothing runs against these yet. See domain/waterline/lead-time.ts for what
 * the offsets mean.
 */

const COLUMN: Record<TreatmentCategory, { fund: string; build: string }> = {
  Assess: { fund: "assessFund", build: "assessBuild" },
  Repair: { fund: "repairFund", build: "repairBuild" },
  Rehabilitate: { fund: "rehabilitateFund", build: "rehabilitateBuild" },
  Renew: { fund: "renewFund", build: "renewBuild" },
  Retire: { fund: "retireFund", build: "retireBuild" },
};

type SetRow = Record<string, unknown> & {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  cashSplits: unknown;
  overrides?: Array<{
    treatmentId: string;
    fundOffset: number;
    buildOffset: number;
    cashSplit: unknown;
    treatment: { name: string; applicability: unknown };
  }>;
};

/** The stored JSON, read defensively: a malformed split reads as "no split"
 * rather than throwing on a page that only wanted to list the sets. */
function toCash(raw: unknown): CashInstalment[] {
  if (!Array.isArray(raw)) return [];
  const cash = raw
    .map((entry) => {
      const e = entry as { offset?: unknown; percent?: unknown };
      return { offset: Number(e.offset), percent: Number(e.percent) };
    })
    .filter((i) => Number.isFinite(i.offset) && Number.isFinite(i.percent));
  return cash.length > 1 ? cash : [];
}

function categoryLead(row: SetRow, category: TreatmentCategory): LeadTime {
  const splits = (row.cashSplits ?? {}) as Record<string, unknown>;
  return {
    fundOffset: Number(row[COLUMN[category].fund] ?? 0),
    buildOffset: Number(row[COLUMN[category].build] ?? 0),
    cash: toCash(splits[category]),
  };
}

function toLeadTimes(row: SetRow): LeadTimes {
  return {
    id: row.id,
    name: row.name,
    byCategory: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, categoryLead(row, k)])) as Record<
      TreatmentCategory,
      LeadTime
    >,
    byTreatment: Object.fromEntries(
      (row.overrides ?? []).map((o) => [
        o.treatment.name,
        { fundOffset: o.fundOffset, buildOffset: o.buildOffset, cash: toCash(o.cashSplit) },
      ])
    ),
  };
}

export type LeadTimeOverrideRow = {
  treatmentId: string;
  treatmentName: string;
  lead: LeadTime;
  /** What its category would have said, so the list can show what changed. */
  insteadOf: LeadTime;
};

export type LeadTimeSetRow = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  byCategory: Record<TreatmentCategory, LeadTime>;
  overrides: LeadTimeOverrideRow[];
  /** The longest a project takes to reach construction under this set — how
   * much of the front of a run can hold nothing but immediate work. */
  longestBuild: number;
  /** True when the set leaves everything in the year it is decided, which is
   * how scenarios have always behaved. */
  immediate: boolean;
  summary: string;
};

const withOverrides = {
  overrides: {
    include: { treatment: { select: { name: true, applicability: true } } },
    orderBy: { treatment: { name: "asc" as const } },
  },
} as const;

/** The category a treatment belongs to, as stored on it. */
function categoryOf(applicability: unknown): TreatmentCategory {
  const category = (applicability as { category?: unknown } | null)?.category;
  return (CATEGORY_KEYS as readonly string[]).includes(String(category))
    ? (category as TreatmentCategory)
    : "Repair";
}

function toRow(row: SetRow): LeadTimeSetRow {
  const times = toLeadTimes(row);
  const overrides = (row.overrides ?? []).map((o) => ({
    treatmentId: o.treatmentId,
    treatmentName: o.treatment.name,
    lead: times.byTreatment[o.treatment.name],
    insteadOf: times.byCategory[categoryOf(o.treatment.applicability)] ?? IMMEDIATE,
  }));

  const moved = CATEGORY_KEYS.filter((k) => times.byCategory[k].buildOffset > 0);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    byCategory: times.byCategory,
    overrides,
    longestBuild: Math.max(
      0,
      ...CATEGORY_KEYS.map((k) => times.byCategory[k].buildOffset),
      ...overrides.map((o) => o.lead.buildOffset)
    ),
    immediate: isImmediate(times),
    summary:
      moved.length === 0
        ? "everything in the year it is decided"
        : moved.map((k) => `${k} ${describeLeadTime(times.byCategory[k])}`).join("; "),
  };
}

export async function listLeadTimeSets(organizationId: string): Promise<LeadTimeSetRow[]> {
  const rows = await prisma.leadTimeSet.findMany({
    where: { organizationId },
    include: withOverrides,
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

/**
 * The lead times to use when nobody chose: the organization's default set, or
 * everything immediate.
 *
 * Never throws and never returns nothing, as `resolveCategoryWeights` does not:
 * a missing set should behave the way the model did before lead times existed,
 * not stop a run.
 */
export async function resolveLeadTimes(
  organizationId: string,
  leadTimeSetId?: string | null
): Promise<LeadTimes> {
  const row = leadTimeSetId
    ? await prisma.leadTimeSet.findFirst({ where: { id: leadTimeSetId, organizationId }, include: withOverrides })
    : await prisma.leadTimeSet.findFirst({ where: { organizationId, isDefault: true }, include: withOverrides });

  return row ? toLeadTimes(row) : IMMEDIATE_LEAD_TIMES;
}

export type LeadTimeSetInput = {
  name: string;
  description: string | null;
  byCategory: Record<TreatmentCategory, LeadTime>;
  overrides: Array<{ treatmentId: string; lead: LeadTime }>;
};

function validate(input: LeadTimeSetInput) {
  if (!input.name.trim()) throw new Error("Give the lead times a name");
  for (const key of CATEGORY_KEYS) validateLeadTime(key, input.byCategory[key]);

  const seen = new Set<string>();
  for (const override of input.overrides) {
    if (!override.treatmentId) throw new Error("Choose a treatment for every exception, or remove it");
    if (seen.has(override.treatmentId)) throw new Error("The same treatment is listed twice as an exception");
    seen.add(override.treatmentId);
    validateLeadTime("That treatment", override.lead);
  }
}

function toColumns(byCategory: Record<TreatmentCategory, LeadTime>) {
  const columns: Record<string, number> = {};
  const cashSplits: Record<string, CashInstalment[]> = {};
  for (const key of CATEGORY_KEYS) {
    columns[COLUMN[key].fund] = byCategory[key].fundOffset;
    columns[COLUMN[key].build] = byCategory[key].buildOffset;
    if (byCategory[key].cash.length > 0) cashSplits[key] = byCategory[key].cash;
  }
  return { ...columns, cashSplits };
}

const overrideRows = (overrides: LeadTimeSetInput["overrides"]) =>
  overrides.map((o) => ({
    treatmentId: o.treatmentId,
    fundOffset: o.lead.fundOffset,
    buildOffset: o.lead.buildOffset,
    cashSplit: o.lead.cash.length > 0 ? o.lead.cash : undefined,
  }));

async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.leadTimeSet.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new Error(`Lead times named "${clash.name}" already exist`);
}

export async function createLeadTimeSet(organizationId: string, input: LeadTimeSetInput): Promise<string> {
  validate(input);
  const name = input.name.trim();
  await assertNameFree(organizationId, name);

  const created = await prisma.leadTimeSet.create({
    data: {
      organizationId,
      name,
      description: input.description?.trim() || null,
      ...toColumns(input.byCategory),
      overrides: { create: overrideRows(input.overrides) },
    },
    select: { id: true },
  });
  return created.id;
}

/** The exceptions are rewritten wholesale rather than reconciled: the editor
 * posts the list it holds, and a removed row means removed. */
export async function updateLeadTimeSet(organizationId: string, id: string, input: LeadTimeSetInput) {
  validate(input);
  const name = input.name.trim();
  const existing = await prisma.leadTimeSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("Those lead times no longer exist");
  await assertNameFree(organizationId, name, id);

  await prisma.$transaction([
    prisma.leadTimeOverride.deleteMany({ where: { setId: id } }),
    prisma.leadTimeSet.update({
      where: { id },
      data: {
        name,
        description: input.description?.trim() || null,
        ...toColumns(input.byCategory),
        overrides: { create: overrideRows(input.overrides) },
      },
    }),
  ]);
}

/** Exactly one default, swapped in one transaction so there is never a moment
 * with two or none. */
export async function setDefaultLeadTimeSet(organizationId: string, id: string) {
  const row = await prisma.leadTimeSet.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!row) throw new Error("Those lead times no longer exist");

  await prisma.$transaction([
    prisma.leadTimeSet.updateMany({ where: { organizationId }, data: { isDefault: false } }),
    prisma.leadTimeSet.update({ where: { id }, data: { isDefault: true } }),
  ]);
}

/** No default means everything happens in the year it is decided — how every
 * scenario behaved before this page existed, and a real choice to return to. */
export async function clearDefaultLeadTimeSet(organizationId: string) {
  await prisma.leadTimeSet.updateMany({ where: { organizationId }, data: { isDefault: false } });
}

export async function copyLeadTimeSet(organizationId: string, id: string): Promise<string> {
  const row = await prisma.leadTimeSet.findFirst({ where: { id, organizationId }, include: { overrides: true } });
  if (!row) throw new Error("Those lead times no longer exist");

  const taken = takenNames(await prisma.leadTimeSet.findMany({ where: { organizationId }, select: { name: true } }));
  const created = await prisma.leadTimeSet.create({
    data: {
      organizationId,
      name: copyName(row.name, taken),
      description: row.description,
      assessFund: row.assessFund,
      assessBuild: row.assessBuild,
      repairFund: row.repairFund,
      repairBuild: row.repairBuild,
      rehabilitateFund: row.rehabilitateFund,
      rehabilitateBuild: row.rehabilitateBuild,
      renewFund: row.renewFund,
      renewBuild: row.renewBuild,
      retireFund: row.retireFund,
      retireBuild: row.retireBuild,
      cashSplits: row.cashSplits ?? {},
      overrides: {
        create: row.overrides.map((o) => ({
          treatmentId: o.treatmentId,
          fundOffset: o.fundOffset,
          buildOffset: o.buildOffset,
          cashSplit: o.cashSplit ?? undefined,
        })),
      },
    },
    select: { id: true },
  });
  return created.id;
}

export async function deleteLeadTimeSet(organizationId: string, id: string) {
  const row = await prisma.leadTimeSet.findFirst({ where: { id, organizationId }, select: { id: true, name: true, isDefault: true } });
  if (!row) throw new Error("Those lead times no longer exist");
  if (row.isDefault) {
    throw new Error(
      `"${row.name}" is the default. Make another set the default first, or clear the default, so it is clear what a scenario that chose nothing should use.`
    );
  }
  await prisma.leadTimeSet.delete({ where: { id } });
}
