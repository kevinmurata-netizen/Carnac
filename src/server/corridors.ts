import { prisma } from "@/lib/prisma";
import { listModelledAssetTypes } from "@/server/modelled-asset-type";
import {
  MAX_SAVING_PCT,
  findNeighbours,
  pairKey,
  type CorridorAsset,
  type PairSaving,
} from "@/domain/waterline/corridor";

/**
 * Corridor bundling settings: how an organization finds corridors, and what
 * doing two asset types' work together in one saves.
 *
 * One settings row per organization (none reads as the defaults), a corridor
 * attribute per asset type, and a savings row per pair of types. See
 * domain/waterline/corridor.ts for what counts as neighbours.
 */

export const CORRIDOR_DEFAULTS = { distanceMeters: 50, windowYears: 2 } as const;
export const DISTANCE_RANGE = { min: 1, max: 1000 } as const;
export const WINDOW_RANGE = { min: 0, max: 5 } as const;

export type CorridorTypeRow = {
  id: string;
  name: string;
  /** The attribute naming its corridor, or null for distance alone. */
  corridorAttribute: string | null;
  /** The type's word attributes, which are what can name a corridor. */
  attributeChoices: Array<{ code: string; label: string }>;
};

export type CorridorSavingRow = PairSaving & { assetTypeAId: string; assetTypeBId: string };

export type CorridorConfig = {
  distanceMeters: number;
  windowYears: number;
  types: CorridorTypeRow[];
  savings: CorridorSavingRow[];
};

export async function getCorridorConfig(organizationId: string): Promise<CorridorConfig> {
  const modelled = await listModelledAssetTypes(organizationId);
  const ids = modelled.map((t) => t.id);
  const [settings, types, savings] = await Promise.all([
    prisma.corridorSettings.findUnique({ where: { organizationId } }),
    prisma.assetType.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        corridorAttribute: true,
        attributeDefinitions: {
          where: { dataType: { in: ["TEXT", "ENUM"] } },
          select: { code: true, label: true },
          orderBy: { label: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.corridorSaving.findMany({ where: { organizationId, assetTypeAId: { in: ids }, assetTypeBId: { in: ids } } }),
  ]);
  return {
    distanceMeters: settings?.distanceMeters ?? CORRIDOR_DEFAULTS.distanceMeters,
    windowYears: settings?.windowYears ?? CORRIDOR_DEFAULTS.windowYears,
    types: types.map((t) => ({
      id: t.id,
      name: t.name,
      corridorAttribute: t.corridorAttribute,
      attributeChoices: t.attributeDefinitions,
    })),
    savings: savings.map((s) => ({
      assetTypeAId: s.assetTypeAId,
      assetTypeBId: s.assetTypeBId,
      sharesMobilization: s.sharesMobilization,
      savingPct: s.savingPct,
    })),
  };
}

/** The savings as a scenario run reads them, by pair key. */
export function savingsByPair(config: CorridorConfig): Map<string, PairSaving> {
  return new Map(
    config.savings.map((s) => [
      pairKey(s.assetTypeAId, s.assetTypeBId),
      { sharesMobilization: s.sharesMobilization, savingPct: s.savingPct },
    ])
  );
}

export type CorridorInput = {
  distanceMeters: number;
  windowYears: number;
  /** By asset type id; null for distance alone. */
  attributes: Record<string, string | null>;
  savings: CorridorSavingRow[];
};

export async function saveCorridorConfig(organizationId: string, input: CorridorInput) {
  const { distanceMeters, windowYears } = input;
  if (!(distanceMeters >= DISTANCE_RANGE.min && distanceMeters <= DISTANCE_RANGE.max)) {
    throw new Error(`The corridor distance must be between ${DISTANCE_RANGE.min} and ${DISTANCE_RANGE.max} metres`);
  }
  if (!Number.isInteger(windowYears) || windowYears < WINDOW_RANGE.min || windowYears > WINDOW_RANGE.max) {
    throw new Error(`The window must be a whole number of years from ${WINDOW_RANGE.min} to ${WINDOW_RANGE.max}`);
  }

  const config = await getCorridorConfig(organizationId);
  const types = new Map(config.types.map((t) => [t.id, t]));
  for (const [typeId, code] of Object.entries(input.attributes)) {
    const type = types.get(typeId);
    if (!type) throw new Error("A corridor attribute can only be set for an asset type this organization models");
    if (code && !type.attributeChoices.some((a) => a.code === code)) {
      throw new Error(`${type.name} has no word attribute "${code}" to name its corridor`);
    }
  }
  const seen = new Set<string>();
  for (const s of input.savings) {
    if (!types.has(s.assetTypeAId) || !types.has(s.assetTypeBId)) {
      throw new Error("A saving can only be set between asset types this organization models");
    }
    const key = pairKey(s.assetTypeAId, s.assetTypeBId);
    if (seen.has(key)) throw new Error("Each pair of asset types has one saving");
    seen.add(key);
    if (!(s.savingPct >= 0 && s.savingPct <= MAX_SAVING_PCT)) {
      throw new Error(`A saving must be between 0% and ${MAX_SAVING_PCT * 100}%`);
    }
  }

  // A pair that saves nothing is no row at all, which reads the same.
  const kept = input.savings
    .filter((s) => s.sharesMobilization || s.savingPct > 0)
    .map((s) => {
      const [a, b] = [s.assetTypeAId, s.assetTypeBId].sort();
      return { organizationId, assetTypeAId: a, assetTypeBId: b, sharesMobilization: s.sharesMobilization, savingPct: s.savingPct };
    });

  await prisma.$transaction([
    prisma.corridorSettings.upsert({
      where: { organizationId },
      create: { organizationId, distanceMeters, windowYears },
      update: { distanceMeters, windowYears },
    }),
    ...Object.entries(input.attributes).map(([id, code]) =>
      prisma.assetType.update({ where: { id }, data: { corridorAttribute: code || null } })
    ),
    prisma.corridorSaving.deleteMany({ where: { organizationId } }),
    prisma.corridorSaving.createMany({ data: kept }),
  ]);
}

/**
 * The modelled assets as corridors see them: where they are, and the value of
 * their type's corridor attribute. `only` narrows it to some assets, as a
 * scenario's filter does.
 */
export async function loadCorridorAssets(
  organizationId: string,
  config: CorridorConfig,
  only?: string[]
): Promise<CorridorAsset[]> {
  const codeOf = new Map(config.types.map((t) => [t.id, t.corridorAttribute]));
  const assets = await prisma.asset.findMany({
    where: {
      deletedAt: null,
      assetTypeId: { in: config.types.map((t) => t.id) },
      ...(only ? { id: { in: only } } : {}),
      assetType: { organizationId },
    },
    select: {
      id: true,
      assetTypeId: true,
      location: { select: { startLat: true, startLng: true, endLat: true, endLng: true } },
      attributeValues: {
        where: { definition: { code: { in: [...new Set([...codeOf.values()].filter((c): c is string => !!c))] } } },
        select: { textValue: true, definition: { select: { code: true, assetTypeId: true } } },
      },
    },
  });
  return assets.map((a) => {
    const code = codeOf.get(a.assetTypeId);
    const value = code
      ? (a.attributeValues.find((v) => v.definition.code === code && v.definition.assetTypeId === a.assetTypeId)?.textValue ?? null)
      : null;
    const l = a.location;
    return {
      id: a.id,
      assetTypeId: a.assetTypeId,
      start: l?.startLat != null && l.startLng != null ? { lat: l.startLat, lng: l.startLng } : null,
      end: l?.endLat != null && l.endLng != null ? { lat: l.endLat, lng: l.endLng } : null,
      corridor: value,
    };
  });
}

export type CorridorPreview = {
  assets: number;
  /** Assets with at least one neighbour. */
  withNeighbours: number;
  /** Assets with no location, which distance cannot place. */
  unlocated: number;
  /** Neighbour pairs by pair of asset types, most first. */
  pairs: Array<{ assetTypeAId: string; assetTypeBId: string; count: number }>;
  /** Per type, how many of its assets record its corridor attribute. */
  attributeCoverage: Array<{ assetTypeId: string; recorded: number; of: number }>;
};

/** What the saved settings find on the network as it stands. */
export async function previewCorridors(organizationId: string, config: CorridorConfig): Promise<CorridorPreview> {
  const assets = await loadCorridorAssets(organizationId, config);
  const withAttribute = new Set(config.types.filter((t) => t.corridorAttribute).map((t) => t.id));
  const neighbours = findNeighbours(assets, config.distanceMeters, withAttribute);
  const typeOf = new Map(assets.map((a) => [a.id, a.assetTypeId]));
  const pairs = new Map<string, number>();
  for (const [a, set] of neighbours) {
    for (const b of set) {
      if (a >= b) continue;
      const key = pairKey(typeOf.get(a)!, typeOf.get(b)!);
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  }
  return {
    assets: assets.length,
    withNeighbours: neighbours.size,
    unlocated: assets.filter((a) => !a.start).length,
    pairs: [...pairs.entries()]
      .map(([key, count]) => {
        const [assetTypeAId, assetTypeBId] = key.split("|");
        return { assetTypeAId, assetTypeBId, count };
      })
      .sort((x, y) => y.count - x.count),
    attributeCoverage: config.types
      .filter((t) => t.corridorAttribute)
      .map((t) => {
        const mine = assets.filter((a) => a.assetTypeId === t.id);
        return { assetTypeId: t.id, recorded: mine.filter((a) => a.corridor?.trim()).length, of: mine.length };
      }),
  };
}
