import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_FULL_WEIGHT_SHARE,
  ROLLUP_STRATEGY_LABELS,
  ROLLUP_STRATEGY_TYPES,
  fullWeightShareOf,
  rollUp,
  type RollupConfig,
  type RollupResult,
  type RollupStrategyType,
} from "@/domain/components/rollup";
import { loadAssetComponents, type AssetComponentRow } from "@/server/components";

/**
 * Which roll-up strategy scores which asset, and what changing that would do.
 *
 * One strategy is the organization's default; an asset type may name another.
 * Nothing is stored per asset: an asset's score is computed on read from its
 * components' snapshots under whichever strategy governs its type, which is
 * what lets a strategy change be previewed and applied with no data entered
 * again.
 */

export type StrategyRow = {
  id: string;
  name: string;
  description: string | null;
  type: RollupStrategyType;
  typeLabel: string;
  config: RollupConfig;
  /** The worst-case share, as a fraction; null for the averages. */
  fullWeightShare: number | null;
  isDefault: boolean;
  /** Asset types that name this strategy as their own. */
  usedBy: string[];
};

/** Where an asset's strategy came from — said beside every score. */
export type StrategySource = "asset type" | "organization default";

export type GoverningStrategy = {
  id: string;
  name: string;
  type: RollupStrategyType;
  config: RollupConfig;
  source: StrategySource;
};

function toRow(
  s: { id: string; name: string; description: string | null; strategyType: RollupStrategyType; config: Prisma.JsonValue; isDefault: boolean },
  usedBy: string[]
): StrategyRow {
  const config = (s.config ?? {}) as RollupConfig;
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    type: s.strategyType,
    typeLabel: ROLLUP_STRATEGY_LABELS[s.strategyType],
    config,
    fullWeightShare: s.strategyType === "WEIGHTED_WORST_CASE" ? fullWeightShareOf(config) : null,
    isDefault: s.isDefault,
    usedBy,
  };
}

/**
 * One of each kind, the first time anything asks. Weighted worst case is the
 * default because it is the cautious one: a failing part is not averaged away.
 * Idempotent, so it is safe to call from any screen.
 */
export async function ensureRollupStrategies(organizationId: string) {
  const count = await prisma.rollupStrategy.count({ where: { organizationId } });
  if (count > 0) return;
  await prisma.rollupStrategy.createMany({
    data: [
      {
        organizationId,
        name: "Weighted worst case",
        description:
          "An asset is as bad as its worst part, to the extent that part matters: the highest-risk component pulls the score toward its own, all the way once it is a large enough share of the asset.",
        strategyType: "WEIGHTED_WORST_CASE",
        config: { fullWeightShare: DEFAULT_FULL_WEIGHT_SHARE },
        isDefault: true,
      },
      {
        organizationId,
        name: "Replacement-cost weighted average",
        description: "Every component counted by its share of what the asset costs to replace.",
        strategyType: "REPLACEMENT_COST_WEIGHTED_AVERAGE",
        config: {},
      },
      {
        organizationId,
        name: "Simple average",
        description: "Every component counted equally — a baseline to check the others against.",
        strategyType: "SIMPLE_AVERAGE",
        config: {},
      },
    ],
  });
}

export type RollupSettings = {
  strategies: StrategyRow[];
  assetTypes: Array<{
    id: string;
    name: string;
    /** The strategy this type names, or null to follow the default. */
    overrideId: string | null;
    governing: GoverningStrategy | null;
    componentTypes: string[];
    assetsWithComponents: number;
  }>;
};

export async function getRollupSettings(organizationId: string): Promise<RollupSettings> {
  await ensureRollupStrategies(organizationId);
  const [strategies, types] = await Promise.all([
    prisma.rollupStrategy.findMany({ where: { organizationId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
    prisma.assetType.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      include: {
        componentTypes: { include: { componentType: { select: { name: true } } }, orderBy: { sortOrder: "asc" } },
        rollupStrategy: { select: { name: true } },
      },
    }),
  ]);

  const withComponents = await prisma.asset.groupBy({
    by: ["assetTypeId"],
    where: { organizationId, deletedAt: null, components: { some: {} } },
    _count: { _all: true },
  });
  const componentCount = new Map(withComponents.map((r) => [r.assetTypeId, r._count._all]));

  const resolve = governingFor(strategies);
  return {
    strategies: strategies.map((s) =>
      toRow(
        s,
        types.filter((t) => t.rollupStrategyId === s.id).map((t) => t.name)
      )
    ),
    assetTypes: types.map((t) => ({
      id: t.id,
      name: t.name,
      overrideId: t.rollupStrategyId,
      governing: resolve(t.rollupStrategyId),
      componentTypes: t.componentTypes.map((c) => c.componentType.name),
      assetsWithComponents: componentCount.get(t.id) ?? 0,
    })),
  };
}

type StoredStrategy = { id: string; name: string; strategyType: RollupStrategyType; config: Prisma.JsonValue; isDefault: boolean };

/** Asset type's own strategy if it names one, otherwise the default. */
function governingFor(strategies: StoredStrategy[]) {
  const byId = new Map(strategies.map((s) => [s.id, s]));
  const fallback = strategies.find((s) => s.isDefault) ?? null;
  return (overrideId: string | null): GoverningStrategy | null => {
    const own = overrideId ? byId.get(overrideId) : undefined;
    const chosen = own ?? fallback;
    if (!chosen) return null;
    return {
      id: chosen.id,
      name: chosen.name,
      type: chosen.strategyType,
      config: (chosen.config ?? {}) as RollupConfig,
      source: own ? "asset type" : "organization default",
    };
  };
}

export type AssetRollup = {
  assetId: string;
  assetCode: string;
  name: string | null;
  assetTypeName: string;
  strategy: GoverningStrategy | null;
  result: RollupResult | null;
  components: AssetComponentRow[];
};

/**
 * Asset scores for the given assets, each under the strategy that governs it.
 *
 * `resolve` lets a caller substitute the strategy that *would* govern — which
 * is all a preview is.
 */
export async function rollUpAssets(
  organizationId: string,
  assetIds: string[],
  resolve?: (assetTypeId: string, overrideId: string | null) => GoverningStrategy | null
): Promise<AssetRollup[]> {
  await ensureRollupStrategies(organizationId);
  const [assets, strategies, components] = await Promise.all([
    prisma.asset.findMany({
      where: { id: { in: assetIds }, organizationId, deletedAt: null },
      select: {
        id: true,
        assetCode: true,
        name: true,
        assetTypeId: true,
        assetType: { select: { name: true, rollupStrategyId: true } },
      },
      orderBy: { assetCode: "asc" },
    }),
    prisma.rollupStrategy.findMany({ where: { organizationId } }),
    loadAssetComponents(organizationId, assetIds),
  ]);
  const current = governingFor(strategies);

  return assets.map((a) => {
    const strategy = resolve
      ? resolve(a.assetTypeId, a.assetType.rollupStrategyId)
      : current(a.assetType.rollupStrategyId);
    const list = components.get(a.id) ?? [];
    return {
      assetId: a.id,
      assetCode: a.assetCode,
      name: a.name,
      assetTypeName: a.assetType.name,
      strategy,
      result: strategy && list.length > 0 ? rollUp(list, { type: strategy.type, config: strategy.config }) : null,
      components: list,
    };
  });
}

// ---------------------------------------------------------------------------
// Changing a strategy: preview, then apply
// ---------------------------------------------------------------------------

/** Every change this screen can make that moves an asset's score. */
export type RollupChange =
  | { kind: "setDefault"; strategyId: string }
  | { kind: "setAssetType"; assetTypeId: string; strategyId: string | null }
  | { kind: "editStrategy"; strategyId: string; type: RollupStrategyType; fullWeightShare: number | null };

export type RollupPreview = {
  /** Assets with components whose score or strategy would change. */
  affected: number;
  /** Assets with components — everything a roll-up strategy can reach. */
  considered: number;
  rows: Array<{
    assetId: string;
    assetCode: string;
    name: string | null;
    assetTypeName: string;
    before: { strategy: string; condition: number | null; risk: number | null };
    after: { strategy: string; condition: number | null; risk: number | null };
  }>;
};

function validateShare(share: number | null): number | null {
  if (share == null) return null;
  if (!(share > 0 && share <= 1)) {
    throw new Error("The share at which a component governs outright must be more than 0% and at most 100%");
  }
  return share;
}

/**
 * What a change would do, without doing it. The same arithmetic the app reads
 * with, run under the strategy each asset would have afterwards.
 */
export async function previewRollupChange(
  organizationId: string,
  change: RollupChange,
  sampleSize = 12
): Promise<RollupPreview> {
  await ensureRollupStrategies(organizationId);
  const strategies = await prisma.rollupStrategy.findMany({ where: { organizationId } });
  if (change.kind !== "setAssetType" && !strategies.some((s) => s.id === change.strategyId)) {
    throw new Error("That strategy no longer exists");
  }
  if (change.kind === "setAssetType" && change.strategyId && !strategies.some((s) => s.id === change.strategyId)) {
    throw new Error("That strategy no longer exists");
  }

  // The strategies as they would stand after the change.
  const proposed = strategies.map((s) => {
    if (change.kind === "setDefault") return { ...s, isDefault: s.id === change.strategyId };
    if (change.kind === "editStrategy" && s.id === change.strategyId) {
      const share = validateShare(change.fullWeightShare);
      const config = { ...((s.config ?? {}) as RollupConfig) };
      if (change.type === "WEIGHTED_WORST_CASE") config.fullWeightShare = share ?? DEFAULT_FULL_WEIGHT_SHARE;
      else delete config.fullWeightShare;
      return { ...s, strategyType: change.type, config: config as Prisma.JsonValue };
    }
    return s;
  });
  const after = governingFor(proposed);
  const resolveAfter = (assetTypeId: string, overrideId: string | null) =>
    after(change.kind === "setAssetType" && change.assetTypeId === assetTypeId ? change.strategyId : overrideId);

  const assets = await prisma.asset.findMany({
    where: { organizationId, deletedAt: null, components: { some: {} } },
    select: { id: true },
  });
  const ids = assets.map((a) => a.id);
  const [beforeRows, afterRows] = await Promise.all([
    rollUpAssets(organizationId, ids),
    rollUpAssets(organizationId, ids, resolveAfter),
  ]);
  const afterById = new Map(afterRows.map((r) => [r.assetId, r]));

  const pairs = beforeRows.map((b) => ({ b, a: afterById.get(b.assetId)! }));
  const changed = pairs.filter(
    ({ b, a }) =>
      b.strategy?.id !== a.strategy?.id ||
      b.result?.condition.value !== a.result?.condition.value ||
      b.result?.risk.value !== a.result?.risk.value
  );
  // The biggest movers first: those are the ones worth looking at before
  // committing to the change.
  const delta = (p: (typeof pairs)[number]) =>
    Math.abs((p.a.result?.condition.value ?? 0) - (p.b.result?.condition.value ?? 0));
  const sample = [...changed].sort((x, y) => delta(y) - delta(x)).slice(0, sampleSize);

  return {
    affected: changed.length,
    considered: pairs.length,
    rows: sample.map(({ b, a }) => ({
      assetId: b.assetId,
      assetCode: b.assetCode,
      name: b.name,
      assetTypeName: b.assetTypeName,
      before: {
        strategy: b.strategy?.name ?? "None",
        condition: b.result?.condition.value ?? null,
        risk: b.result?.risk.value ?? null,
      },
      after: {
        strategy: a.strategy?.name ?? "None",
        condition: a.result?.condition.value ?? null,
        risk: a.result?.risk.value ?? null,
      },
    })),
  };
}

/** Make the change a preview described. */
export async function applyRollupChange(organizationId: string, change: RollupChange) {
  const strategy =
    change.kind === "setAssetType" && change.strategyId == null
      ? null
      : await prisma.rollupStrategy.findFirst({
          where: { id: change.strategyId!, organizationId },
        });
  if (change.strategyId != null && !strategy) throw new Error("That strategy no longer exists");

  if (change.kind === "setDefault") {
    await prisma.$transaction([
      prisma.rollupStrategy.updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } }),
      prisma.rollupStrategy.update({ where: { id: change.strategyId }, data: { isDefault: true } }),
    ]);
    return;
  }

  if (change.kind === "setAssetType") {
    const type = await prisma.assetType.findFirst({ where: { id: change.assetTypeId, organizationId } });
    if (!type) throw new Error("Asset type not found");
    await prisma.assetType.update({ where: { id: type.id }, data: { rollupStrategyId: change.strategyId } });
    return;
  }

  const share = validateShare(change.fullWeightShare);
  const config = { ...((strategy!.config ?? {}) as RollupConfig) };
  if (change.type === "WEIGHTED_WORST_CASE") config.fullWeightShare = share ?? DEFAULT_FULL_WEIGHT_SHARE;
  else delete config.fullWeightShare;
  await prisma.rollupStrategy.update({
    where: { id: strategy!.id },
    data: { strategyType: change.type, config: config as Prisma.InputJsonObject },
  });
}

/** A new strategy changes nothing until the default or an asset type points at it. */
export async function createRollupStrategy(
  organizationId: string,
  input: { name: string; description: string | null; type: RollupStrategyType; fullWeightShare: number | null }
) {
  const name = input.name.trim();
  if (!name) throw new Error("A strategy needs a name");
  if (!ROLLUP_STRATEGY_TYPES.includes(input.type)) throw new Error("Unknown strategy type");
  const clash = await prisma.rollupStrategy.findFirst({ where: { organizationId, name } });
  if (clash) throw new Error(`There is already a strategy called "${name}"`);
  const share = validateShare(input.fullWeightShare);
  await prisma.rollupStrategy.create({
    data: {
      organizationId,
      name,
      description: input.description?.trim() || null,
      strategyType: input.type,
      config: input.type === "WEIGHTED_WORST_CASE" ? { fullWeightShare: share ?? DEFAULT_FULL_WEIGHT_SHARE } : {},
    },
  });
}

/** Refused while the strategy is the default or an asset type uses it —
 * deleting it then would silently change every score it governs. */
export async function deleteRollupStrategy(organizationId: string, strategyId: string) {
  const strategy = await prisma.rollupStrategy.findFirst({
    where: { id: strategyId, organizationId },
    include: { assetTypes: { select: { name: true } } },
  });
  if (!strategy) throw new Error("That strategy no longer exists");
  if (strategy.isDefault) throw new Error(`"${strategy.name}" is the default. Make another strategy the default first.`);
  if (strategy.assetTypes.length > 0) {
    throw new Error(
      `"${strategy.name}" scores ${strategy.assetTypes.map((t) => t.name).join(", ")}. Point ${
        strategy.assetTypes.length === 1 ? "that type" : "those types"
      } elsewhere first.`
    );
  }
  await prisma.rollupStrategy.delete({ where: { id: strategy.id } });
}
