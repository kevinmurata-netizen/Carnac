import { prisma } from "@/lib/prisma";
import { copyName, takenNames } from "@/lib/copy-name";
import {
  WATERLINE_TREATMENTS,
  rulesFromWindow,
  type TreatmentDef,
  type TreatmentCategory,
  type CostRate,
} from "@/domain/waterline/treatment";
import {
  countConditions,
  isValidRuleNode,
  type Rule,
  type RuleGroup,
} from "@/domain/waterline/decision-tree";
import { parseRules } from "@/server/rules";
import { toEffectDef } from "@/server/effects";
import { combineEffects } from "@/domain/waterline/effect";
import { createStandardRate } from "@/server/cost-rates";

/**
 * The treatment library is configuration. These loaders map Treatment rows
 * back into the TreatmentDef shape the domain logic already speaks, so
 * recommendations, LCCA, work plans and scenarios all run against what an
 * administrator configured rather than the seed constant.
 */

type TreatmentWithRules = Awaited<ReturnType<typeof fetchTreatments>>[number];

const withRules = {
  ruleLinks: { include: { rule: true } },
  costRates: { include: { rule: true }, orderBy: { sortOrder: "asc" } },
  effectLinks: { include: { effect: true }, orderBy: { sortOrder: "asc" } },
} as const;

/** Cost rates in the order they are tried. A rate whose rule fails validation
 * is dropped rather than treated as ruleless, because a broken rule silently
 * becoming a catch-all would reprice the whole network. */
function toCostRates(
  rows: Array<{
    id: string;
    name: string;
    sortOrder: number;
    unitCost: number;
    costUnit: string;
    mobilizationCost: number;
    annualMaintenanceCost: number;
    rule: Parameters<typeof parseRules>[0][number] | null;
  }>
): CostRate[] {
  return rows.flatMap((row) => {
    let rule: Rule | null = null;
    if (row.rule) {
      rule = parseRules([row.rule])[0] ?? null;
      if (!rule) return [];
    }
    return [
      {
        id: row.id,
        name: row.name,
        sortOrder: row.sortOrder,
        rule,
        unitCost: row.unitCost,
        costUnit: row.costUnit === "per LF" ? "per LF" : "per each",
        mobilizationCost: row.mobilizationCost,
        annualMaintenanceCost: row.annualMaintenanceCost,
      },
    ];
  });
}

/**
 * The single fallback rate a seed definition's prices amount to.
 *
 * Only ever called with the shipped library, which always carries prices —
 * a treatment read back from the database has real rate rows instead, and
 * since Phase 6b has no prices of its own to fall back on. The defaults are
 * here so that stays true by construction rather than by assumption: a
 * priceless definition yields a zero rate, which is visibly wrong, rather than
 * NaN costs that propagate silently through every ranking.
 */
export function standardRateFor(def: TreatmentDef): CostRate {
  return {
    id: `seed-${def.name}`,
    name: "Standard",
    sortOrder: 0,
    rule: null,
    unitCost: def.unitCost ?? 0,
    costUnit: def.costUnit ?? "per each",
    mobilizationCost: def.mobilizationCost ?? 0,
    annualMaintenanceCost: def.annualMaintenanceCost ?? 0,
  };
}

function fetchTreatments(organizationId: string) {
  return prisma.treatment.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: withRules,
    // Was the condition window, which no longer exists. Name, because a
    // treatment library is a list someone looks things up in, and category
    // would group Repair together while scattering the alphabet inside it.
    orderBy: { name: "asc" },
  });
}

function toDef(row: TreatmentWithRules): TreatmentDef {
  const applicability = (row.applicability ?? {}) as {
    category?: string;
    constraints?: string | null;
  };

  // What the treatment does comes from its effects, combined. The columns
  // and applicability keys that used to hold it are no longer read: the
  // treatment_effects migration built an effect from each treatment's own
  // values — including the seed-name fallback for rows that predated the
  // reset/gain discriminator — so every treatment starts with exactly the
  // effect it had. A treatment with no effects does nothing, which is right
  // for an inspection and visible on the page for anything else.
  const effect = combineEffects(row.effectLinks.map((l) => toEffectDef(l.effect)));

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    category: (applicability.category as TreatmentCategory) ?? "Repair",
    // The window is absent on purpose. It described what a treatment applied
    // to before rules did, and the columns behind it are gone — a stored
    // treatment is gated by its rules and nothing else. The fields survive on
    // TreatmentDef because the shipped library still uses them, once, to
    // generate those rules at seed time.
    ...effect,
    // No prices either: cost rates own them, and `costRates` below carries
    // the real ones.
    usefulLife: row.usefulLife ?? 0,
    retreatmentIntervalYears: row.retreatmentIntervalYears,
    implementationConstraints: applicability.constraints ?? undefined,
    rules: parseRules(row.ruleLinks.map((l) => l.rule)),
    ruleTree: parseRuleTree(row.ruleTree),
    costRates: toCostRates(row.costRates),
  };
}

/**
 * The live treatment library. Falls back to the seed constant only when the
 * database has none, so a fresh install still behaves.
 *
 * The fallback has to carry rules of its own now that rules are what decide
 * applicability. Without them a brand-new install would consider every
 * treatment for every asset — the opposite of the old behaviour, and
 * spectacularly wrong rather than quietly wrong.
 */
export async function loadTreatmentDefs(organizationId: string): Promise<TreatmentDef[]> {
  const rows = await fetchTreatments(organizationId);
  if (rows.length === 0) {
    return WATERLINE_TREATMENTS.map((def) => ({
      ...def,
      rules: rulesFromWindow(def),
      costRates: [standardRateFor(def)],
    }));
  }
  return rows.map(toDef);
}

export type TreatmentAdminRow = TreatmentDef & {
  id: string;
  /** Conditions across every rule gating this treatment. */
  ruleConditionCount: number;
  ruleCount: number;
  blockRuleCount: number;
  workPlanItemCount: number;
  /** Combinations this treatment is a member of. Deleting it removes it from
   * each, which can leave a bundle of one — worth saying before it happens. */
  combinationCount: number;
};

function toAdminRow(
  row: TreatmentWithRules & { _count: { workPlanItems: number; combinationMemberships: number } }
): TreatmentAdminRow {
  const def = toDef(row);
  const rules = def.rules ?? [];
  return {
    ...def,
    id: row.id,
    ruleConditionCount: rules.reduce((n, r) => n + countConditions(r.root), 0),
    ruleCount: rules.length,
    blockRuleCount: rules.filter((r) => r.effect === "block").length,
    workPlanItemCount: row._count.workPlanItems,
    combinationCount: row._count.combinationMemberships,
  };
}

export async function listTreatmentsForAdmin(organizationId: string): Promise<TreatmentAdminRow[]> {
  const rows = await prisma.treatment.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: { ...withRules, _count: { select: { workPlanItems: true, combinationMemberships: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map(toAdminRow);
}

export async function getTreatmentForAdmin(
  organizationId: string,
  id: string
): Promise<TreatmentAdminRow | null> {
  const row = await prisma.treatment.findFirst({
    where: { id, assetType: { code: "WATERLINE", organizationId } },
    include: { ...withRules, _count: { select: { workPlanItems: true, combinationMemberships: true } } },
  });
  return row ? toAdminRow(row) : null;
}

export type TreatmentInput = {
  name: string;
  description: string;
  category: TreatmentCategory;
  // The condition window, material list and diameter bounds are absent on
  // purpose: they are rules now, edited on the treatment's own page, and as of
  // Phase 6b the columns behind them are gone too. What the treatment does is
  // absent for the same reason: it is effects now, set with setTreatmentEffects.

  /**
   * The fallback rate a newly created treatment starts with.
   *
   * Optional because only the create path supplies them, and only to seed one
   * TreatmentCostRate. They used to be columns on the treatment as well; the
   * edit form has not asked about them since Phase 2, and `updateTreatment`
   * never wrote them.
   */
  unitCost?: number;
  costUnit?: "per LF" | "per each";
  mobilizationCost?: number;
  annualMaintenanceCost?: number;
  usefulLife: number;
  /** Null keeps the shipped default rather than meaning "no limit". */
  retreatmentIntervalYears: number | null;
  implementationConstraints: string | null;
};

function validate(input: TreatmentInput) {
  if (!input.name.trim()) throw new Error("Treatment name is required");
  if ((input.unitCost ?? 0) < 0 || (input.mobilizationCost ?? 0) < 0) {
    throw new Error("Costs cannot be negative");
  }
}

// `existing` is spread first and keys the form no longer asks about are not
// written, so a treatment edited today keeps what it was migrated with rather
// than having it silently blanked. That includes the old reset/gain keys, kept
// for one release so the treatment_effects migration can be reverted.
function toApplicability(input: TreatmentInput, existing: Record<string, unknown> = {}) {
  return {
    ...existing,
    category: input.category,
    constraints: input.implementationConstraints,
  };
}

export async function updateTreatment(organizationId: string, id: string, input: TreatmentInput) {
  validate(input);
  const existing = await prisma.treatment.findFirst({
    where: { id, assetType: { code: "WATERLINE", organizationId } },
  });
  if (!existing) throw new Error("Treatment not found");

  await prisma.treatment.update({
    where: { id },
    data: {
      name: input.name.trim(),
      description: input.description.trim() || null,
      applicability: toApplicability(input, (existing.applicability ?? {}) as Record<string, unknown>),
      // The effect columns are not written: effects own what a treatment does.
      // The cost columns are deliberately not written. Cost rates own the
      // price now, the edit form no longer asks about it, and writing the
      // form's empty defaults here would blank what these columns still hold.
      usefulLife: input.usefulLife,
      retreatmentIntervalYears: input.retreatmentIntervalYears,
    },
  });
}

export async function createTreatment(organizationId: string, input: TreatmentInput) {
  validate(input);
  const assetType = await prisma.assetType.findFirst({ where: { code: "WATERLINE", organizationId } });
  if (!assetType) throw new Error("WATERLINE asset type not found");

  const clash = await prisma.treatment.findFirst({
    where: { assetTypeId: assetType.id, name: input.name.trim() },
  });
  if (clash) throw new Error(`A treatment named "${input.name.trim()}" already exists`);

  const created = await prisma.treatment.create({
    data: {
      assetTypeId: assetType.id,
      name: input.name.trim(),
      description: input.description.trim() || null,
      applicability: toApplicability(input),
      usefulLife: input.usefulLife,
      retreatmentIntervalYears: input.retreatmentIntervalYears,
    },
    select: { id: true },
  });

  // Without a rate the treatment cannot be priced, so it would be silently
  // absent from every recommendation. Created here so a new treatment is
  // usable the moment it exists, with the price just entered as its fallback.
  await createStandardRate(created.id, {
    unitCost: input.unitCost ?? 0,
    costUnit: input.costUnit ?? "per each",
    mobilizationCost: input.mobilizationCost ?? 0,
    annualMaintenanceCost: input.annualMaintenanceCost ?? 0,
  });

  return created.id;
}

/**
 * Delete several treatments at once.
 *
 * Deletes every one it can and keeps the rest, rather than refusing the lot
 * because one is in use. The rule is the same as for a single delete — a
 * treatment a work plan uses cannot go — and the answer is a list of what
 * was deleted and what was kept and why, so a partial result is never
 * mistaken for a complete one.
 */
export async function deleteTreatments(
  organizationId: string,
  ids: string[]
): Promise<{ deleted: string[]; kept: Array<{ name: string; reason: string }> }> {
  const rows = await prisma.treatment.findMany({
    where: { id: { in: ids }, assetType: { code: "WATERLINE", organizationId } },
    select: { id: true, name: true, _count: { select: { workPlanItems: true } } },
  });

  const deletable = rows.filter((r) => r._count.workPlanItems === 0);
  const kept = rows
    .filter((r) => r._count.workPlanItems > 0)
    .map((r) => ({
      name: r.name,
      reason: `used by ${r._count.workPlanItems.toLocaleString("en-US")} work plan project${r._count.workPlanItems === 1 ? "" : "s"}`,
    }));

  if (deletable.length > 0) {
    // Scoped again by organization in the delete itself, not only by the ids
    // the lookup returned — the ids arrive from a form.
    await prisma.treatment.deleteMany({
      where: { id: { in: deletable.map((r) => r.id) }, assetType: { code: "WATERLINE", organizationId } },
    });
  }

  return { deleted: deletable.map((r) => r.name), kept };
}

/**
 * Copy several treatments, with everything that makes one usable: its
 * definition, the arrangement of rules deciding when it can be used and its
 * blocks, its prices in order, and its effects — under "(copy)" names.
 *
 * Rules and effects are shared, so a copy points at the same ones rather than
 * duplicating them; change the copy's by attaching different ones. What is
 * not copied is what records decisions about the original: work plan
 * projects, scenario option lists and combination memberships.
 */
export async function copyTreatments(organizationId: string, ids: string[]): Promise<string[]> {
  const [rows, all] = await Promise.all([
    prisma.treatment.findMany({
      where: { id: { in: ids }, assetType: { code: "WATERLINE", organizationId } },
      include: { costRates: { orderBy: { sortOrder: "asc" } }, ruleLinks: true, effectLinks: true },
      orderBy: { name: "asc" },
    }),
    prisma.treatment.findMany({
      where: { assetType: { code: "WATERLINE", organizationId } },
      select: { name: true },
    }),
  ]);
  const taken = takenNames(all);

  const names: string[] = [];
  await prisma.$transaction(
    rows.map((t) => {
      const name = copyName(t.name, taken);
      names.push(name);
      return prisma.treatment.create({
        data: {
          assetTypeId: t.assetTypeId,
          name,
          description: t.description,
          applicability: t.applicability ?? undefined,
          expectedLifeExtension: t.expectedLifeExtension,
          effectOnCondition: t.effectOnCondition,
          effectOnFailureProb: t.effectOnFailureProb,
          usefulLife: t.usefulLife,
          retreatmentIntervalYears: t.retreatmentIntervalYears,
          ruleTree: t.ruleTree ?? undefined,
          ruleLinks: { create: t.ruleLinks.map((l) => ({ ruleId: l.ruleId })) },
          effectLinks: { create: t.effectLinks.map((l) => ({ effectId: l.effectId, sortOrder: l.sortOrder })) },
          costRates: {
            create: t.costRates.map((r) => ({
              name: r.name,
              sortOrder: r.sortOrder,
              ruleId: r.ruleId,
              unitCost: r.unitCost,
              costUnit: r.costUnit,
              mobilizationCost: r.mobilizationCost,
              annualMaintenanceCost: r.annualMaintenanceCost,
            })),
          },
        },
      });
    })
  );
  return names;
}

export async function deleteTreatment(organizationId: string, id: string) {
  const row = await prisma.treatment.findFirst({
    where: { id, assetType: { code: "WATERLINE", organizationId } },
    include: { _count: { select: { workPlanItems: true } } },
  });
  if (!row) throw new Error("Treatment not found");

  if (row._count.workPlanItems > 0) {
    throw new Error(
      `"${row.name}" is used by ${row._count.workPlanItems} work plan project(s) and cannot be deleted. Delete or regenerate those plans first.`
    );
  }

  await prisma.treatment.delete({ where: { id } });
}

/** Stored as JSON, so validated on the way out rather than trusted. An
 * unreadable tree is treated as absent, which falls back to the flat reading
 * — permissive and visible, rather than silently excluding every asset. */
function parseRuleTree(value: unknown): RuleGroup | undefined {
  if (!isValidRuleNode(value)) return undefined;
  return (value as RuleGroup).kind === "group" ? (value as RuleGroup) : undefined;
}
