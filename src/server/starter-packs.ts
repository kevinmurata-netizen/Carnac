import { prisma } from "@/lib/prisma";
import { createAssetType, createInspectionTemplate, updateAssetTypeMeasures } from "@/server/settings";
import { createAttributeDefinition } from "@/server/field-config";
import { setAssetTypeModelled } from "@/server/modelling";
import { addComponent, renameIndex } from "@/server/condition-model";
import { createMaterialCurve } from "@/server/deterioration";
import { createEffect, setTreatmentEffects } from "@/server/effects";
import { createTreatment } from "@/server/treatment-config";
import { STARTER_PACKS, type PackType, type StarterPack } from "@/config/starter-packs";

/**
 * Apply a starter pack: each chosen asset type set up exactly as it would be
 * by hand under Settings — through the same functions those screens call —
 * so a type made from a pack is no different from one made by hand, and is
 * the utility's to change from the first moment.
 *
 * A type whose code the organization already uses is left as it is: a pack
 * adds, it never overwrites someone's configuration.
 */

export type PackTypeChoice = { code: string; name: string; description: string; exists: boolean };

export type PackChoice = {
  id: string;
  name: string;
  description: string;
  types: PackTypeChoice[];
};

/** The packs on offer, with which of their types this organization has. */
export async function listStarterPacks(organizationId: string): Promise<PackChoice[]> {
  const existing = new Set(
    (await prisma.assetType.findMany({ where: { organizationId }, select: { code: true } })).map((t) => t.code)
  );
  return STARTER_PACKS.map((pack) => ({
    id: pack.id,
    name: pack.name,
    description: pack.description,
    types: pack.types.map((t) => ({ code: t.code, name: t.name, description: t.description, exists: existing.has(t.code) })),
  }));
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
