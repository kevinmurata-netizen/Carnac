/**
 * Where the demo network's pipes physically go.
 *
 * The first version of this data placed every segment as an independent line
 * at a random bearing inside a circle, which produced a scatter of
 * disconnected sticks over farmland — nothing like a distribution system.
 * A real network is a *connected* graph that follows streets: trunk mains out
 * of the plant, primary mains along arterials, distribution mains on the
 * blocks between, and loops so no neighbourhood hangs off a single feed.
 *
 * This builds that shape. The data is still invented — no real utility's
 * layout is reproduced here — but it is invented with the right topology, so
 * the map reads like a water system rather than a spill of matchsticks.
 */

const FT_PER_DEGREE_LAT = 364_000;

export type NetworkTier = "trunk" | "primary" | "distribution";

export type NetworkEdge = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  /** True length of this run, so the stored attribute matches the geometry. */
  lengthFt: number;
  serviceArea: string;
  pressureZone: string;
  tier: NetworkTier;
};

/**
 * The town the demo utility serves.
 *
 * A real street grid, so mains sit on roads instead of floating over fields —
 * the single thing that most makes the map look wrong otherwise. The utility
 * and its service areas remain fictional.
 */
export type LayoutOptions = {
  centerLat: number;
  centerLng: number;
  /** Spacing between arterials in degrees of latitude. ~0.0055° ≈ 2,000 ft. */
  spacing: number;
  cols: number;
  rows: number;
  seed: number;
};

export const DEFAULT_LAYOUT: LayoutOptions = {
  // Wichita, Kansas: a clear section-line grid at a believable size for a
  // 260-segment system, and in the same state the seed data already implied.
  centerLat: 37.6872,
  centerLng: -97.3301,
  spacing: 0.0055,
  cols: 18,
  rows: 17,
  seed: 20260902,
};

/** Service areas, laid out as regions of the grid rather than loose circles,
 * so each one is a contiguous part of town the way a pressure zone is. */
const AREAS: Array<{ name: string; pressureZone: string }> = [
  { name: "Downtown", pressureZone: "Zone B - Mid" },
  { name: "Riverside", pressureZone: "Zone A - Low" },
  { name: "Highland Park", pressureZone: "Zone C - High" },
  { name: "Eastgate", pressureZone: "Zone B - Mid" },
  { name: "Southport", pressureZone: "Zone A - Low" },
  { name: "Millbrook", pressureZone: "Zone C - High" },
];

/** Deterministic RNG, so the same seed always lays out the same town. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const nodeKey = (col: number, row: number) => `${col},${row}`;

export function buildNetworkLayout(count: number, options: Partial<LayoutOptions> = {}): NetworkEdge[] {
  const o = { ...DEFAULT_LAYOUT, ...options };
  const rand = mulberry32(o.seed);
  const ftPerDegreeLng = FT_PER_DEGREE_LAT * Math.cos((o.centerLat * Math.PI) / 180);

  // Node positions, jittered so the result reads as streets rather than graph
  // paper. The jitter is a fraction of the spacing, so junctions still line up.
  const positions = new Map<string, { lat: number; lng: number }>();
  const halfCols = (o.cols - 1) / 2;
  const halfRows = (o.rows - 1) / 2;
  for (let col = 0; col < o.cols; col++) {
    for (let row = 0; row < o.rows; row++) {
      positions.set(nodeKey(col, row), {
        lat: o.centerLat + (row - halfRows) * o.spacing + (rand() - 0.5) * o.spacing * 0.18,
        lng: o.centerLng + (col - halfCols) * o.spacing * 1.25 + (rand() - 0.5) * o.spacing * 0.18,
      });
    }
  }

  const mid = { col: Math.floor(o.cols / 2), row: Math.floor(o.rows / 2) };

  type Candidate = { a: [number, number]; b: [number, number]; tier: NetworkTier };
  const candidates: Candidate[] = [];

  const tierFor = (col: number, row: number, horizontal: boolean): NetworkTier | null => {
    // The backbone: one full run each way through the middle of town.
    if ((horizontal && row === mid.row) || (!horizontal && col === mid.col)) return "trunk";
    // Arterials every fourth street carry the primary mains. Any denser and
    // the network reads as all backbone, where a real system is mostly small
    // distribution pipe hung off a comparatively sparse skeleton.
    if ((horizontal && row % 4 === 0) || (!horizontal && col % 4 === 0)) return "primary";

    // Everything else is distribution, thinning out toward the edge of town —
    // density falling off from the centre is what stops a synthetic network
    // looking like a uniform mesh.
    const dx = (col - mid.col) / halfCols;
    const dy = (row - mid.row) / halfRows;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return rand() < 0.97 - distance * 0.55 ? "distribution" : null;
  };

  for (let col = 0; col < o.cols; col++) {
    for (let row = 0; row < o.rows; row++) {
      if (col + 1 < o.cols) {
        const tier = tierFor(col, row, true);
        if (tier) candidates.push({ a: [col, row], b: [col + 1, row], tier });
      }
      if (row + 1 < o.rows) {
        const tier = tierFor(col, row, false);
        if (tier) candidates.push({ a: [col, row], b: [col, row + 1], tier });
      }
    }
  }

  // Keep only what the plant can actually reach. An isolated main is a data
  // error in a real system, and on a map it reads as one too.
  const adjacency = new Map<string, Candidate[]>();
  for (const edge of candidates) {
    for (const node of [edge.a, edge.b]) {
      const key = nodeKey(node[0], node[1]);
      if (!adjacency.has(key)) adjacency.set(key, []);
      adjacency.get(key)!.push(edge);
    }
  }

  const plant = nodeKey(mid.col, mid.row);
  const reached = new Set<Candidate>();
  const seenNodes = new Set<string>([plant]);
  const queue = [plant];
  while (queue.length > 0) {
    const key = queue.shift()!;
    for (const edge of adjacency.get(key) ?? []) {
      reached.add(edge);
      for (const node of [edge.a, edge.b]) {
        const next = nodeKey(node[0], node[1]);
        if (!seenNodes.has(next)) {
          seenNodes.add(next);
          queue.push(next);
        }
      }
    }
  }

  const areaFor = (col: number, row: number): { name: string; pressureZone: string } => {
    // Six contiguous regions: three columns of town, split top and bottom.
    const band = col < o.cols / 3 ? 0 : col < (2 * o.cols) / 3 ? 1 : 2;
    const half = row < o.rows / 2 ? 0 : 1;
    return AREAS[band * 2 + half];
  };

  const edges: NetworkEdge[] = [...reached].map((edge) => {
    const from = positions.get(nodeKey(edge.a[0], edge.a[1]))!;
    const to = positions.get(nodeKey(edge.b[0], edge.b[1]))!;
    const dLat = (to.lat - from.lat) * FT_PER_DEGREE_LAT;
    const dLng = (to.lng - from.lng) * ftPerDegreeLng;
    const area = areaFor(Math.round((edge.a[0] + edge.b[0]) / 2), Math.round((edge.a[1] + edge.b[1]) / 2));

    return {
      startLat: from.lat,
      startLng: from.lng,
      endLat: to.lat,
      endLng: to.lng,
      lengthFt: Math.round(Math.sqrt(dLat * dLat + dLng * dLng)),
      serviceArea: area.name,
      pressureZone: area.pressureZone,
      tier: edge.tier,
    };
  });

  // Trunk first, so the caller can hand the biggest pipes to the backbone and
  // the map reads correctly: heavy mains through the middle, small ones out on
  // the blocks.
  const rank: Record<NetworkTier, number> = { trunk: 0, primary: 1, distribution: 2 };
  edges.sort((a, b) => rank[a.tier] - rank[b.tier] || b.lengthFt - a.lengthFt);

  return edges.slice(0, count);
}
