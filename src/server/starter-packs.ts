import { prisma } from "@/lib/prisma";
import { createAssetType, createInspectionTemplate, updateAssetTypeMeasures } from "@/server/settings";
import { createAttributeDefinition } from "@/server/field-config";
import { setAssetTypeModelled } from "@/server/modelling";
import { addComponent, renameIndex } from "@/server/condition-model";
import { createMaterialCurve } from "@/server/deterioration";
import { createEffect, setTreatmentEffects } from "@/server/effects";
import { createTreatment } from "@/server/treatment-config";
import { commitImport, validateImport } from "@/server/import";
import { commitInspectionImport } from "@/server/inspection-import";
import { createScenarioSet } from "@/server/scenario-sets";
import { createScenario, runScenarioSet } from "@/server/scenarios";
import { DEFAULT_ASSUMPTIONS } from "@/domain/waterline/scenario";
import { STARTER_PACKS, sampleFiles, type PackType, type StarterPack } from "@/config/starter-packs";

/**
 * Apply a starter pack: each chosen asset type set up exactly as it would be
 * by hand under Settings — through the same functions those screens call —
 * so a type made from a pack is no different from one made by hand, and is
 * the utility's to change from the first moment.
 *
 * A type whose code the organization already uses is left as it is: a pack
 * adds, it never overwrites someone's configuration.
 */

export type PackTypeChoice = {
  code: string;
  name: string;
  description: string;
  exists: boolean;
  /** Assets of this type the organization has. */
  assets: number;
};

/** One file of a pack's sample data, in the order they are loaded. */
export type SampleStep = { typeCode: string; typeName: string; kind: "assets" | "inspections"; name: string; url: string };

export type PackChoice = {
  id: string;
  name: string;
  description: string;
  types: PackTypeChoice[];
  /** Whether Data Import offers made-up files for its types. */
  hasSamples: boolean;
  /** Its sample files, every type's assets before any inspections. */
  samples: SampleStep[];
  /** Its sample scenario set, where it has one, and whether this organization
   * has a set of that name already. */
  scenarioSet: { name: string; scenarios: number; years: number; loaded: boolean } | null;
};

/** The packs on offer, with which of their types this organization has. */
export async function listStarterPacks(organizationId: string): Promise<PackChoice[]> {
  const types = await prisma.assetType.findMany({
    where: { organizationId },
    select: { code: true, _count: { select: { assets: { where: { deletedAt: null } } } } },
  });
  const assetsOf = new Map(types.map((t) => [t.code, t._count.assets]));
  const sets = await prisma.scenarioSet.findMany({ where: { organizationId }, select: { name: true } });
  const setNames = new Set(sets.map((s) => s.name));
  return STARTER_PACKS.map((pack) => {
    const withSamples = pack.types.filter((t) => t.samples);
    const step = (t: PackType, kind: SampleStep["kind"]) =>
      sampleFiles(t.code, kind).map((f) => ({ typeCode: t.code, typeName: t.name, kind, ...f }));
    return {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      types: pack.types.map((t) => ({
        code: t.code,
        name: t.name,
        description: t.description,
        exists: assetsOf.has(t.code),
        assets: assetsOf.get(t.code) ?? 0,
      })),
      hasSamples: withSamples.length > 0,
      samples: [...withSamples.flatMap((t) => step(t, "assets")), ...withSamples.flatMap((t) => step(t, "inspections"))],
      scenarioSet: pack.sampleScenarioSet
        ? {
            name: pack.sampleScenarioSet.name,
            scenarios: pack.sampleScenarioSet.scenarios.length,
            years: pack.sampleScenarioSet.planningPeriodYears,
            loaded: setNames.has(pack.sampleScenarioSet.name),
          }
        : null,
    };
  });
}

export type PackOutcome = {
  created: string[];
  skipped: Array<{ name: string; reason: string }>;
  /** Pairs of asset types given a corridor saving. */
  savings: number;
};

/** An effect of this name, reused where the organization has one already —
 * effect names are unique within it, and the same name means the same thing. */
async function effectId(organizationId: string, effect: PackType["effects"][number]): Promise<string> {
  const found = await prisma.effect.findFirst({ where: { organizationId, name: effect.name }, select: { id: true } });
  if (found) return found.id;
  return createEffect(organizationId, effect);
}

async function applyType(organizationId: string, type: PackType) {
  await createAssetType(organizationId, {
    code: type.code,
    name: type.name,
    description: type.description,
    geometry: type.geometry,
  });
  const created = await prisma.assetType.findFirstOrThrow({
    where: { organizationId, code: type.code },
    select: { id: true },
  });
  const id = created.id;

  for (const a of type.attributes) {
    await createAttributeDefinition(organizationId, id, {
      code: a.code,
      label: a.label,
      dataType: a.dataType,
      unit: a.unit,
      isRequired: !!a.required,
      options: a.options ?? [],
      help: a.help,
    });
  }

  await updateAssetTypeMeasures(organizationId, id, {
    ...Object.fromEntries(Object.entries(type.measures).map(([role, code]) => [role, code ?? ""])),
    sizeCost: type.sizeCostScale ? "on" : "",
    sizeCostReference: type.sizeCostScale ? String(type.sizeCostScale.reference) : "",
    sizeCostExponent: type.sizeCostScale ? String(type.sizeCostScale.exponent) : "",
    failureRepairCost: String(type.failureCost.repairCost),
    failurePerCustomer: String(type.failureCost.perCustomer),
  });

  // The form the field crews fill in, before the index that scores it.
  await createInspectionTemplate(organizationId, id, { name: type.inspection, description: null });
  await setAssetTypeModelled(organizationId, id, true);
  for (const c of type.index.components) {
    await addComponent(organizationId, { code: c.code, label: c.label, weight: c.weight, helpText: c.help, assetTypeId: id });
  }
  await renameIndex(organizationId, type.index.name, id);

  for (const c of type.curves) {
    await createMaterialCurve(organizationId, id, {
      material: c.material,
      curve: { initialCondition: 100, minCondition: 0, serviceLife: c.serviceLife, shape: c.shape },
    });
  }

  const effects = new Map<string, string>();
  for (const e of type.effects) effects.set(e.name, await effectId(organizationId, e));

  for (const t of type.treatments) {
    const treatmentId = await createTreatment(organizationId, {
      name: t.name,
      description: t.description,
      category: t.category,
      role: t.role ?? null,
      unitCost: t.unitCost,
      costUnit: t.costUnit,
      mobilizationCost: t.mobilizationCost,
      annualMaintenanceCost: 0,
      usefulLife: t.usefulLife,
      retreatmentIntervalYears: t.retreatmentIntervalYears ?? null,
      implementationConstraints: null,
      assetTypeId: id,
    });
    const ids = t.effects.map((name) => effects.get(name)).filter((x): x is string => !!x);
    if (ids.length > 0) await setTreatmentEffects(organizationId, treatmentId, ids);
  }
}

/** Corridor savings between the pack's types, for pairs involving a type this
 * run created, where the organization has both and has not set a saving for
 * that pair already. Types it had before are the utility's to pair. */
async function applySavings(organizationId: string, pack: StarterPack, created: Set<string>): Promise<number> {
  const types = await prisma.assetType.findMany({
    where: { organizationId, code: { in: pack.types.map((t) => t.code) } },
    select: { id: true, code: true },
  });
  const idOf = new Map(types.map((t) => [t.code, t.id]));
  let added = 0;
  for (const s of pack.corridorSavings) {
    if (!created.has(s.a) && !created.has(s.b)) continue;
    const a = idOf.get(s.a);
    const b = idOf.get(s.b);
    if (!a || !b) continue;
    const [first, second] = [a, b].sort();
    const existing = await prisma.corridorSaving.findUnique({
      where: { assetTypeAId_assetTypeBId: { assetTypeAId: first, assetTypeBId: second } },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.corridorSaving.create({
      data: {
        organizationId,
        assetTypeAId: first,
        assetTypeBId: second,
        sharesMobilization: s.sharesMobilization,
        savingPct: s.savingPct,
      },
    });
    added++;
  }
  return added;
}

export async function applyStarterPack(organizationId: string, packId: string, typeCodes: string[]): Promise<PackOutcome> {
  const pack = STARTER_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("That starter pack doesn't exist");
  const chosen = pack.types.filter((t) => typeCodes.includes(t.code));
  if (chosen.length === 0) throw new Error("Choose at least one asset type from the pack");

  const outcome: PackOutcome = { created: [], skipped: [], savings: 0 };
  const createdCodes = new Set<string>();
  for (const type of chosen) {
    const clash = await prisma.assetType.findFirst({ where: { organizationId, code: type.code }, select: { name: true } });
    if (clash) {
      outcome.skipped.push({ name: type.name, reason: `${clash.name} already uses the code ${type.code}, so it was left as it is` });
      continue;
    }
    try {
      await applyType(organizationId, type);
      outcome.created.push(type.name);
      createdCodes.add(type.code);
    } catch (e) {
      // Said plainly, with how far it got: a half-made type is visible under
      // Settings › Asset Types and can be finished or deleted there.
      outcome.skipped.push({
        name: type.name,
        reason: `stopped partway: ${e instanceof Error ? e.message : "an unexpected error"}. Check it under Settings › Asset Types.`,
      });
    }
  }
  outcome.savings = await applySavings(organizationId, pack, createdCodes);
  return outcome;
}

/**
 * One of a pack's sample files, loaded the way anyone's data is: through Data
 * Import's own validation and import, so a demo network arrives exactly as a
 * real one would. The browser sends the files one at a time, so no single
 * request has the whole network to write.
 *
 * Only into a type the pack made (matched by code) — and assets only while it
 * has none, so a live network is never mixed with made-up data.
 */
export async function loadSampleFile(
  organizationId: string,
  userId: string,
  input: { typeCode: string; kind: "assets" | "inspections"; csv: string }
): Promise<{ imported: number; typeName: string }> {
  const pack = STARTER_PACKS.find((p) => p.types.some((t) => t.code === input.typeCode && t.samples));
  if (!pack) throw new Error(`No starter pack has sample data for ${input.typeCode}`);
  const type = await prisma.assetType.findFirst({
    where: { organizationId, code: input.typeCode },
    select: { id: true, name: true, _count: { select: { assets: { where: { deletedAt: null } } } } },
  });
  if (!type) throw new Error(`Add ${input.typeCode} from the starter pack first`);

  if (input.kind === "assets") {
    if (type._count.assets > 0) {
      throw new Error(`${type.name} already has assets; sample data only goes into an empty type`);
    }
    const report = await validateImport(organizationId, type.id, input.csv);
    if (report.errors.length > 0) {
      const e = report.errors[0];
      throw new Error(`${type.name} sample row ${e.row}, ${e.column}: ${e.message}`);
    }
    const result = await commitImport(organizationId, type.id, input.csv);
    return { imported: result.imported, typeName: type.name };
  }
  const result = await commitInspectionImport(organizationId, type.id, userId, input.csv);
  return { imported: result.imported, typeName: type.name };
}

/**
 * A pack's sample scenario set, made through Scenario Planning's own
 * functions, as a Draft starting this year. Only once every type of the
 * sample network holds assets: its budgets are sized for that network, and
 * over empty types every scenario would run to nothing.
 */
export async function createSampleScenarioSet(organizationId: string, packId: string): Promise<number> {
  const pack = STARTER_PACKS.find((p) => p.id === packId);
  const sample = pack?.sampleScenarioSet;
  if (!pack || !sample) throw new Error("That starter pack has no sample scenario set");
  const needed = pack.types.filter((t) => t.samples);
  const types = await prisma.assetType.findMany({
    where: { organizationId, code: { in: needed.map((t) => t.code) } },
    select: { code: true, _count: { select: { assets: { where: { deletedAt: null } } } } },
  });
  const empty = needed.filter((t) => !types.some((x) => x.code === t.code && x._count.assets > 0));
  if (empty.length > 0) {
    throw new Error(`Load the sample network first: ${empty.map((t) => t.name).join(", ")} has no assets yet`);
  }

  const set = await createScenarioSet(organizationId, {
    name: sample.name,
    description: sample.description,
    baseYear: new Date().getFullYear(),
    planningPeriodYears: sample.planningPeriodYears,
    status: "DRAFT",
  });
  for (const s of sample.scenarios) {
    await createScenario(organizationId, {
      name: s.name,
      description: s.description,
      assumptions: { ...DEFAULT_ASSUMPTIONS, analysisPeriodYears: sample.planningPeriodYears, ...s.assumptions },
      scenarioSetId: set.id,
    });
  }
  return sample.scenarios.length;
}

/** Run every scenario in a pack's sample set, as Run Set does, so the
 * comparison is there to open. A separate request from making the set, so
 * neither has the other's work to do in its time. */
export async function runSampleScenarioSet(organizationId: string, packId: string): Promise<number> {
  const name = STARTER_PACKS.find((p) => p.id === packId)?.sampleScenarioSet?.name;
  const set = name ? await prisma.scenarioSet.findFirst({ where: { organizationId, name }, select: { id: true } }) : null;
  if (!set) throw new Error("The sample scenario set hasn't been made yet");
  return runScenarioSet(organizationId, set.id);
}
