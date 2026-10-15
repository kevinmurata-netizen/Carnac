/**
 * Corridors: which assets are close enough that doing their work together
 * saves money — one crew, one traffic plan, one reinstatement.
 *
 * Two assets are neighbours when they lie within a set distance of each
 * other, measured between the nearest points of their lines or locations.
 * Where both assets' types name a corridor attribute (a street, say) and both
 * assets record it, the attribute decides instead: the same value makes them
 * neighbours however far apart, a different value does not however close.
 *
 * Pure geometry and grouping — what bundling saves, and what a run does with
 * it, live elsewhere.
 */

export type LatLng = { lat: number; lng: number };

export type CorridorAsset = {
  id: string;
  assetTypeId: string;
  /** A line's two ends, or a point (end null). Null when it has no location. */
  start: LatLng | null;
  end: LatLng | null;
  /** The corridor attribute's value, where the asset's type names one and the
   * asset records it. */
  corridor: string | null;
};

/** Metres per degree of latitude, near enough for neighbour distances. */
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_AT_EQUATOR = 111_320;

type Seg = { ax: number; ay: number; bx: number; by: number };

function pointSegmentDistance(px: number, py: number, s: Seg): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / len2));
  const cx = s.ax + t * dx;
  const cy = s.ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number) {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

function segmentsCross(p: Seg, q: Seg): boolean {
  const d1 = cross(q.ax, q.ay, q.bx, q.by, p.ax, p.ay);
  const d2 = cross(q.ax, q.ay, q.bx, q.by, p.bx, p.by);
  const d3 = cross(p.ax, p.ay, p.bx, p.by, q.ax, q.ay);
  const d4 = cross(p.ax, p.ay, p.bx, p.by, q.bx, q.by);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The distance between two segments (a point is a segment of no length). */
export function segmentDistance(p: Seg, q: Seg): number {
  if (segmentsCross(p, q)) return 0;
  return Math.min(
    pointSegmentDistance(p.ax, p.ay, q),
    pointSegmentDistance(p.bx, p.by, q),
    pointSegmentDistance(q.ax, q.ay, p),
    pointSegmentDistance(q.bx, q.by, p)
  );
}

const normalize = (value: string | null) => {
  const v = value?.trim().toLowerCase();
  return v ? v : null;
};

/**
 * Each asset's neighbours, by id. An asset with none is absent.
 *
 * Distances use a flat projection centred on the network, which is accurate
 * to well under a metre at corridor distances anywhere a utility operates.
 * Candidate pairs come from a grid of cells the size of the distance, so a
 * large network is not compared pair by pair.
 */
export function findNeighbours(
  assets: CorridorAsset[],
  distanceMeters: number,
  /** Asset types that name a corridor attribute. */
  typesWithCorridor: ReadonlySet<string>
): Map<string, Set<string>> {
  const neighbours = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    if (!neighbours.has(b)) neighbours.set(b, new Set());
    neighbours.get(a)!.add(b);
    neighbours.get(b)!.add(a);
  };

  // Where both record the attribute, it decides — so such a pair is linked
  // here on a match, and never by distance below.
  const decidedByAttribute = (a: CorridorAsset, b: CorridorAsset) =>
    typesWithCorridor.has(a.assetTypeId) &&
    typesWithCorridor.has(b.assetTypeId) &&
    normalize(a.corridor) != null &&
    normalize(b.corridor) != null;

  const byValue = new Map<string, CorridorAsset[]>();
  for (const a of assets) {
    const v = typesWithCorridor.has(a.assetTypeId) ? normalize(a.corridor) : null;
    if (!v) continue;
    byValue.set(v, [...(byValue.get(v) ?? []), a]);
  }
  for (const group of byValue.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) link(group[i].id, group[j].id);
  }

  const located = assets.filter((a) => a.start);
  if (located.length === 0 || !(distanceMeters > 0)) return neighbours;
  const lat0 = located.reduce((s, a) => s + a.start!.lat, 0) / located.length;
  const mPerLng = M_PER_DEG_LNG_AT_EQUATOR * Math.cos((lat0 * Math.PI) / 180);
  const seg = (a: CorridorAsset): Seg => {
    const e = a.end ?? a.start!;
    return {
      ax: a.start!.lng * mPerLng,
      ay: a.start!.lat * M_PER_DEG_LAT,
      bx: e.lng * mPerLng,
      by: e.lat * M_PER_DEG_LAT,
    };
  };

  const cell = Math.max(distanceMeters, 1);
  const grid = new Map<string, number[]>();
  const segs = located.map(seg);
  const cellsOf = (s: Seg, pad: number) => {
    const x0 = Math.floor((Math.min(s.ax, s.bx) - pad) / cell);
    const x1 = Math.floor((Math.max(s.ax, s.bx) + pad) / cell);
    const y0 = Math.floor((Math.min(s.ay, s.by) - pad) / cell);
    const y1 = Math.floor((Math.max(s.ay, s.by) + pad) / cell);
    const out: string[] = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(`${x}:${y}`);
    return out;
  };
  segs.forEach((s, i) => {
    for (const k of cellsOf(s, 0)) grid.set(k, [...(grid.get(k) ?? []), i]);
  });
  segs.forEach((s, i) => {
    const seen = new Set<number>();
    for (const k of cellsOf(s, distanceMeters)) {
      for (const j of grid.get(k) ?? []) {
        if (j <= i || seen.has(j)) continue;
        seen.add(j);
        const a = located[i];
        const b = located[j];
        if (decidedByAttribute(a, b)) continue;
        if (segmentDistance(s, segs[j]) <= distanceMeters) link(a.id, b.id);
      }
    }
  });
  return neighbours;
}

/**
 * Connected groups of neighbours, largest first: every asset in a group can
 * be reached from every other by steps of one neighbour. A preview of how
 * many places bundling could act on, not a bundle — a bundle is a year's
 * work, which only a run decides.
 */
export function corridorGroups(neighbours: Map<string, Set<string>>): string[][] {
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const start of neighbours.keys()) {
    if (seen.has(start)) continue;
    const group: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const id = stack.pop()!;
      group.push(id);
      for (const n of neighbours.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}

/** What doing two asset types' work together saves. */
export type PairSaving = {
  sharesMobilization: boolean;
  /** 0 to 0.5: a further share off each added member's cost. */
  savingPct: number;
};

export const MAX_SAVING_PCT = 0.5;

/** One key for a pair of asset types, whichever order they come in. */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The saving for a pair, or none. */
export function pairSaving(savings: Map<string, PairSaving>, a: string, b: string): PairSaving | null {
  return savings.get(pairKey(a, b)) ?? null;
}
