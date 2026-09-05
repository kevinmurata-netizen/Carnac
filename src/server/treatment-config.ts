import { prisma } from "@/lib/prisma";
import {
  WATERLINE_TREATMENTS,
  rulesFromWindow,
  type TreatmentDef,
  type TreatmentCategory,
} from "@/domain/waterline/treatment";
import { countConditions, type QualifyMode } from "@/domain/waterline/decision-tree";
import { parseRules } from "@/server/rules";

/**
 * The treatment library is configuration. These loaders map Treatment rows
 * back into the TreatmentDef shape the domain logic already speaks, so
 * recommendations, LCCA, work plans and scenarios all run against what an
 * administrator configured rather than the seed constant.
 */

type TreatmentWithRules = Awaited<ReturnType<typeof fetchTreatments>>[number];

const withRules = {
  ruleLinks: { include: { rule: true } },
} as const;

function fetchTreatments(organizationId: string) {
  return prisma.treatment.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: withRules,
    orderBy: { applicableConditionMin: "asc" },
  });
}

function toDef(row: TreatmentWithRules): TreatmentDef {
  const applicability = (row.applicability ?? {}) as {
    category?: string;
    materials?: string[] | null;
    diameterMin?: number | null;
    diameterMax?: number | null;
    constraints?: string | null;
    conditionResetTo?: number | null;
    conditionGain?: number | null;
  };

  // effectOnCondition stores a single number, so the applicability blob
  // records WHICH of reset/gain it was — the distinction matters enormously
  // (a reset renews the asset, a gain only patches it).
  //
  // Rows written before that discriminator existed carry neither key. Falling
  // back to the seed definition by name keeps them working; without this they
  // load with no condition effect at all, so treatments silently stop
  // improving anything and the whole network decays in every scenario.
  const hasDiscriminator =
    applicability.conditionResetTo != null || applicability.conditionGain != null;
  const seed = hasDiscriminator ? undefined : WATERLINE_TREATMENTS.find((t) => t.name === row.name);

  const resetTo = hasDiscriminator ? (applicability.conditionResetTo ?? null) : (seed?.conditionResetTo ?? null);
  const gain = hasDiscriminator ? (applicability.conditionGain ?? null) : (seed?.conditionGain ?? null);

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    category: (applicability.category as TreatmentCategory) ?? "Repair",
    applicableConditionMin: row.applicableConditionMin ?? 0,
    applicableConditionMax: row.applicableConditionMax ?? 100,
    applicableMaterials: applicability.materials ?? undefined,
    applicableDiameterMin: applicability.diameterMin ?? undefined,
    applicableDiameterMax: applicability.diameterMax ?? undefined,
    conditionResetTo: resetTo ?? undefined,
    conditionGain: gain ?? undefined,
    failureProbMultiplier: row.effectOnFailureProb ?? 1,
    expectedLifeExtension: row.expectedLifeExtension ?? 0,
    unitCost: row.unitCost ?? 0,
    costUnit: (row.costUnit as "per LF" | "per each") ?? "per each",
    mobilizationCost: row.mobilizationCost ?? 0,
    annualMaintenanceCost: row.annualMaintenanceCost ?? 0,
    usefulLife: row.usefulLife ?? 0,
    implementationConstraints: applicability.constraints ?? undefined,
    rules: parseRules(row.ruleLinks.map((l) => l.rule)),
    qualifyMode: (row.qualifyMode === "any" ? "any" : "all") as QualifyMode,
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
    return WATERLINE_TREATMENTS.map((def) => ({ ...def, rules: rulesFromWindow(def), qualifyMode: "all" as const }));
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
};

function toAdminRow(row: TreatmentWithRules & { _count: { workPlanItems: number } }): TreatmentAdminRow {
  const def = toDef(row);
  const rules = def.rules ?? [];
  return {
    ...def,
    id: row.id,
    ruleConditionCount: rules.reduce((n, r) => n + countConditions(r.root), 0),
    ruleCount: rules.length,
    blockRuleCount: rules.filter((r) => r.effect === "block").length,
    workPlanItemCount: row._count.workPlanItems,
  };
}

export async function listTreatmentsForAdmin(organizationId: string): Promise<TreatmentAdminRow[]> {
  const rows = await prisma.treatment.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    include: { ...withRules, _count: { select: { workPlanItems: true } } },
    orderBy: [{ applicableConditionMin: "asc" }, { name: "asc" }],
  });
  return rows.map(toAdminRow);
}

export async function getTreatmentForAdmin(
  organizationId: string,
  id: string
): Promise<TreatmentAdminRow | null> {
  const row = await prisma.treatment.findFirst({
    where: { id, assetType: { code: "WATERLINE", organizationId } },
    include: { ...withRules, _count: { select: { workPlanItems: true } } },
  });
  return row ? toAdminRow(row) : null;
}

export type TreatmentInput = {
  name: string;
  description: string;
  category: TreatmentCategory;
  // The condition window, material list and diameter bounds are absent on
  // purpose: they are rules now, edited on the treatment's own page. The
  // columns behind them still hold what they last held, and this form no
  // longer writes to them, so nothing rewrites history on an unrelated edit.
  /** Exactly one of these is used; the other must be null. */
  conditionResetTo: number | null;
  conditionGain: number | null;
  failureProbMultiplier: number;
  expectedLifeExtension: number;
  unitCost: number;
  costUnit: "per LF" | "per each";
  mobilizationCost: number;
  annualMaintenanceCost: number;
  usefulLife: number;
  implementationConstraints: string | null;
};

function validate(input: TreatmentInput) {
  if (!input.name.trim()) throw new Error("Treatment name is required");
  if (input.failureProbMultiplier < 0 || input.failureProbMultiplier > 1) {
    throw new Error("Failure probability multiplier must be between 0 and 1 (1 = no effect)");
  }
  if (input.conditionResetTo != null && input.conditionGain != null) {
    throw new Error("Choose either a condition reset or a condition gain, not both");
  }
  if (input.unitCost < 0 || input.mobilizationCost < 0) throw new Error("Costs cannot be negative");
}

// `existing` is spread first and the applicability keys are no longer written,
// so a treatment edited today keeps the window it was migrated from rather
// than having it silently blanked by a form that no longer asks about it.
function toApplicability(input: TreatmentInput, existing: Record<string, unknown> = {}) {
  return {
    ...existing,
    category: input.category,
    constraints: input.implementationConstraints,
    conditionResetTo: input.conditionResetTo,
    conditionGain: input.conditionGain,
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
      expectedLifeExtension: input.expectedLifeExtension,
      effectOnCondition: input.conditionResetTo ?? input.conditionGain ?? 0,
      effectOnFailureProb: input.failureProbMultiplier,
      unitCost: input.unitCost,
      costUnit: input.costUnit,
      mobilizationCost: input.mobilizationCost,
      annualMaintenanceCost: input.annualMaintenanceCost,
      usefulLife: input.usefulLife,
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

  await prisma.treatment.create({
    data: {
      assetTypeId: assetType.id,
      name: input.name.trim(),
      description: input.description.trim() || null,
      applicability: toApplicability(input),
      expectedLifeExtension: input.expectedLifeExtension,
      effectOnCondition: input.conditionResetTo ?? input.conditionGain ?? 0,
      effectOnFailureProb: input.failureProbMultiplier,
      unitCost: input.unitCost,
      costUnit: input.costUnit,
      mobilizationCost: input.mobilizationCost,
      annualMaintenanceCost: input.annualMaintenanceCost,
      usefulLife: input.usefulLife,
      costs: {
        create: [
          { costType: "Initial", amount: input.unitCost },
          { costType: "Maintenance", amount: input.annualMaintenanceCost },
        ],
      },
    },
  });
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

  await prisma.treatmentRule.deleteMany({ where: { treatmentId: id } });
  await prisma.treatmentCost.deleteMany({ where: { treatmentId: id } });
  await prisma.treatment.delete({ where: { id } });
}
