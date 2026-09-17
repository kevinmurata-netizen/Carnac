import { prisma } from "@/lib/prisma";
import { copyName, takenNames } from "@/lib/copy-name";
import {
  combineEffects,
  describeEffect,
  type CombinedEffect,
  type EffectConditionMode,
  type EffectDef,
} from "@/domain/waterline/effect";

/**
 * Treatment effects: named, organization-owned descriptions of what a
 * treatment does, shared across the library the way rules are.
 *
 * See ../domain/waterline/effect.ts for how several combine on one treatment.
 */

export type EffectSummary = EffectDef & {
  description: string | null;
  isGenerated: boolean;
  /** The effect in a sentence, e.g. "resets condition to 65, failure
   * probability ×0.6, +15 years of life". */
  summary: string;
  /** Treatments using this effect, alphabetically. */
  usedBy: string[];
  /** Why it cannot be deleted right now, or null when it can. */
  deleteBlocker: string | null;
};

type EffectRow = {
  id: string;
  name: string;
  description: string | null;
  conditionMode: string;
  conditionValue: number | null;
  failureProbMultiplier: number;
  expectedLifeExtension: number;
  isGenerated: boolean;
};

const withUsage = {
  treatments: { include: { treatment: { select: { name: true } } } },
} as const;

function toMode(value: string): EffectConditionMode {
  return value === "reset" || value === "gain" ? value : "none";
}

/** The shape the engine reads. Exported for the treatment loader. */
export function toEffectDef(row: EffectRow): EffectDef {
  const conditionMode = toMode(row.conditionMode);
  return {
    id: row.id,
    name: row.name,
    conditionMode,
    conditionValue: conditionMode === "none" ? null : row.conditionValue,
    failureProbMultiplier: row.failureProbMultiplier,
    expectedLifeExtension: row.expectedLifeExtension,
  };
}

function toSummary(row: EffectRow & { treatments: Array<{ treatment: { name: string } }> }): EffectSummary {
  const def = toEffectDef(row);
  const usedBy = row.treatments.map((t) => t.treatment.name).sort();
  return {
    ...def,
    description: row.description,
    isGenerated: row.isGenerated,
    summary: describeEffect(def),
    usedBy,
    // Taking an effect away from a treatment silently changes what it does,
    // so an effect in use is refused — the same stance rules take.
    deleteBlocker: usedBy.length > 0 ? `still used by ${usedBy.join(", ")}` : null,
  };
}

export async function listEffects(organizationId: string): Promise<EffectSummary[]> {
  const rows = await prisma.effect.findMany({
    where: { organizationId },
    include: withUsage,
    orderBy: { name: "asc" },
  });
  return rows.map(toSummary);
}

export async function getEffect(organizationId: string, id: string): Promise<EffectSummary | null> {
  const row = await prisma.effect.findFirst({ where: { id, organizationId }, include: withUsage });
  return row ? toSummary(row) : null;
}

export type EffectInput = {
  name: string;
  description: string | null;
  conditionMode: EffectConditionMode;
  conditionValue: number | null;
  failureProbMultiplier: number;
  expectedLifeExtension: number;
};

function validate(input: EffectInput): EffectInput {
  const name = input.name.trim();
  if (!name) throw new Error("Give the effect a name");
  if (!["reset", "gain", "none"].includes(input.conditionMode)) throw new Error("Choose what the effect does to condition");

  let conditionValue: number | null = null;
  if (input.conditionMode !== "none") {
    if (input.conditionValue == null || !Number.isFinite(input.conditionValue)) {
      throw new Error(
        input.conditionMode === "reset" ? "Enter the condition it resets to" : "Enter the condition points it adds"
      );
    }
    if (input.conditionValue < 0 || input.conditionValue > 100) {
      throw new Error("Condition values run from 0 to 100");
    }
    conditionValue = input.conditionValue;
  }

  if (!Number.isFinite(input.failureProbMultiplier) || input.failureProbMultiplier < 0 || input.failureProbMultiplier > 1) {
    throw new Error("The failure probability multiplier runs from 0 (removes all risk) to 1 (no change)");
  }
  if (!Number.isInteger(input.expectedLifeExtension) || input.expectedLifeExtension < 0) {
    throw new Error("Life extension is a whole number of years, zero or more");
  }

  return {
    name,
    description: input.description?.trim() || null,
    conditionMode: input.conditionMode,
    conditionValue,
    failureProbMultiplier: input.failureProbMultiplier,
    expectedLifeExtension: input.expectedLifeExtension,
  };
}

/** Case-insensitive, matching rules: "Resets to 65" and "resets to 65" are the
 * same effect to everyone except a unique index. */
async function assertNameFree(organizationId: string, name: string, exceptId?: string) {
  const clash = await prisma.effect.findFirst({
    where: {
      organizationId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new Error(`An effect named "${clash.name}" already exists`);
}

export async function createEffect(organizationId: string, input: EffectInput): Promise<string> {
  const data = validate(input);
  await assertNameFree(organizationId, data.name);
  const created = await prisma.effect.create({ data: { organizationId, ...data }, select: { id: true } });
  return created.id;
}

export async function updateEffect(organizationId: string, id: string, input: EffectInput) {
  const existing = await prisma.effect.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!existing) throw new Error("That effect no longer exists");
  const data = validate(input);
  await assertNameFree(organizationId, data.name, id);
  // An effect someone has edited is theirs, not the migration's.
  await prisma.effect.update({ where: { id }, data: { ...data, isGenerated: false } });
}

export async function deleteEffect(organizationId: string, id: string) {
  const row = await prisma.effect.findFirst({ where: { id, organizationId }, include: withUsage });
  if (!row) throw new Error("That effect no longer exists");
  const summary = toSummary(row);
  if (summary.deleteBlocker) {
    throw new Error(
      `"${row.name}" is ${summary.deleteBlocker}. Remove it from those treatments first — deleting it would silently change what they do.`
    );
  }
  await prisma.effect.delete({ where: { id } });
}

/** Delete several: every effect no treatment uses, keeping and naming the rest. */
export async function deleteEffects(
  organizationId: string,
  ids: string[]
): Promise<{ deleted: string[]; kept: Array<{ name: string; reason: string }> }> {
  const rows = (
    await prisma.effect.findMany({ where: { id: { in: ids }, organizationId }, include: withUsage })
  ).map(toSummary);

  const deletable = rows.filter((r) => r.deleteBlocker == null);
  const kept = rows
    .filter((r) => r.deleteBlocker != null)
    .map((r) => ({ name: r.name, reason: r.deleteBlocker! }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (deletable.length > 0) {
    await prisma.effect.deleteMany({ where: { id: { in: deletable.map((r) => r.id) }, organizationId } });
  }
  return { deleted: deletable.map((r) => r.name).sort(), kept };
}

/**
 * Copy several effects under "(copy)" names. A copy belongs to no treatment,
 * so copying changes nothing until one is added somewhere — which is the
 * point: copy a shared effect, then change the copy for one treatment without
 * changing the others.
 */
export async function copyEffects(organizationId: string, ids: string[]): Promise<string[]> {
  const [rows, all] = await Promise.all([
    prisma.effect.findMany({ where: { id: { in: ids }, organizationId }, orderBy: { name: "asc" } }),
    prisma.effect.findMany({ where: { organizationId }, select: { name: true } }),
  ]);
  const taken = takenNames(all);
  const copies = rows.map((e) => ({
    organizationId,
    name: copyName(e.name, taken),
    description: e.description,
    conditionMode: e.conditionMode,
    conditionValue: e.conditionValue,
    failureProbMultiplier: e.failureProbMultiplier,
    expectedLifeExtension: e.expectedLifeExtension,
  }));
  if (copies.length > 0) await prisma.effect.createMany({ data: copies });
  return copies.map((c) => c.name);
}

// ---------------------------------------------------------------------------
// A treatment's effects
// ---------------------------------------------------------------------------

export async function getTreatmentEffects(
  organizationId: string,
  treatmentId: string
): Promise<{ effects: EffectSummary[]; combined: CombinedEffect } | null> {
  const treatment = await prisma.treatment.findFirst({
    where: { id: treatmentId, assetType: { code: "WATERLINE", organizationId } },
    include: { effectLinks: { include: { effect: { include: withUsage } }, orderBy: { sortOrder: "asc" } } },
  });
  if (!treatment) return null;
  const effects = treatment.effectLinks.map((l) => toSummary(l.effect));
  return { effects, combined: combineEffects(effects) };
}

/**
 * Replace a treatment's effects with these, in this order.
 *
 * Every id is checked against the organization: they arrive from the browser,
 * and an effect from elsewhere must not become part of this library.
 */
export async function setTreatmentEffects(organizationId: string, treatmentId: string, effectIds: string[]) {
  const treatment = await prisma.treatment.findFirst({
    where: { id: treatmentId, assetType: { code: "WATERLINE", organizationId } },
    select: { id: true },
  });
  if (!treatment) throw new Error("That treatment no longer exists");

  const unique = [...new Set(effectIds)];
  const found = await prisma.effect.findMany({ where: { id: { in: unique }, organizationId }, select: { id: true } });
  if (found.length !== unique.length) throw new Error("One of those effects no longer exists");

  await prisma.$transaction([
    prisma.treatmentEffectLink.deleteMany({ where: { treatmentId } }),
    prisma.treatmentEffectLink.createMany({
      data: unique.map((effectId, sortOrder) => ({ treatmentId, effectId, sortOrder })),
    }),
  ]);
}
