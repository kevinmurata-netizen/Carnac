/**
 * Where illustrative pipe is drawn.
 *
 * The inventory gives lengths by diameter and no alignments, so something has
 * to decide where a line goes. Scattering them at random bearings produced a
 * map of diagonals across the mountains, which is wrong in a way anyone can
 * see — water does not run over the Oquirrhs.
 *
 * So the lines follow corridors: the valley's north-south axis, the
 * cross-valley connectors, and the Provo link over the Point of the Mountain.
 * Those corridors are traced from public geography — the shape of the valley,
 * where the cities are, where a canyon lets water through — and **they are not
 * the District's alignments.** JVWCD's pipe routes are not in the published
 * data. A line here says "there is this much pipe of this size, roughly in this
 * part of the system"; it does not say a main runs under that street.
 *
 * Small pipe is drawn differently from large on purpose. A 60-inch aqueduct
 * runs for miles along one corridor; six-inch distribution main runs a few
 * hundred feet at a time along a street grid, and Salt Lake's grid is square,
 * so those strands are drawn square too.
 */

export type Point = { lat: number; lng: number };

/** Feet per degree, near 40.6° north — good enough for drawing. */
export const FT_PER_DEG_LAT = 364_000;
export const FT_PER_DEG_LNG = 277_000;

export type Corridor = {
  name: string;
  /** What kind of pipe belongs on it. */
  role: "trunk" | "distribution";
  waypoints: Point[];
};

/**
 * The corridors, north to south. Trunk corridors carry the large diameters;
 * distribution corridors are the built-up parts of the member cities, where
 * the small stuff is drawn on the grid.
 */
export const CORRIDORS: Corridor[] = [
  {
    name: "West valley trunk",
    role: "trunk",
    waypoints: [
      { lat: 40.715, lng: -112.015 },
      { lat: 40.66, lng: -112.01 },
      { lat: 40.6, lng: -111.995 },
      { lat: 40.54, lng: -111.985 },
      { lat: 40.49, lng: -111.96 },
      { lat: 40.468, lng: -111.94 },
    ],
  },
  {
    name: "Mid-valley trunk",
    role: "trunk",
    waypoints: [
      { lat: 40.705, lng: -111.905 },
      { lat: 40.64, lng: -111.898 },
      { lat: 40.58, lng: -111.89 },
      { lat: 40.52, lng: -111.888 },
      { lat: 40.478, lng: -111.9 },
    ],
  },
  {
    name: "East bench trunk",
    role: "trunk",
    waypoints: [
      { lat: 40.7, lng: -111.845 },
      { lat: 40.65, lng: -111.835 },
      { lat: 40.6, lng: -111.83 },
      { lat: 40.55, lng: -111.828 },
      { lat: 40.51, lng: -111.845 },
    ],
  },
  {
    name: "Southwest arm",
    role: "trunk",
    waypoints: [
      { lat: 40.512, lng: -112.04 },
      { lat: 40.505, lng: -112.0 },
      { lat: 40.5, lng: -111.96 },
      { lat: 40.492, lng: -111.925 },
    ],
  },
  {
    name: "Provo link over the Point of the Mountain",
    role: "trunk",
    waypoints: [
      { lat: 40.468, lng: -111.94 },
      { lat: 40.44, lng: -111.885 },
      { lat: 40.4, lng: -111.83 },
      { lat: 40.36, lng: -111.75 },
      { lat: 40.32, lng: -111.66 },
      { lat: 40.295, lng: -111.6 },
    ],
  },
  {
    name: "North cross-valley",
    role: "trunk",
    waypoints: [
      { lat: 40.665, lng: -112.01 },
      { lat: 40.664, lng: -111.94 },
      { lat: 40.662, lng: -111.87 },
      { lat: 40.66, lng: -111.84 },
    ],
  },
  {
    name: "Mid cross-valley",
    role: "trunk",
    waypoints: [
      { lat: 40.578, lng: -111.99 },
      { lat: 40.576, lng: -111.92 },
      { lat: 40.574, lng: -111.86 },
      { lat: 40.572, lng: -111.83 },
    ],
  },
  {
    name: "South cross-valley",
    role: "trunk",
    waypoints: [
      { lat: 40.518, lng: -111.98 },
      { lat: 40.517, lng: -111.93 },
      { lat: 40.516, lng: -111.88 },
      { lat: 40.515, lng: -111.85 },
    ],
  },
  // The built-up parts of the member cities, as boxes the grid is drawn in.
  {
    name: "West Valley City and Taylorsville",
    role: "distribution",
    waypoints: [
      { lat: 40.71, lng: -112.03 },
      { lat: 40.65, lng: -111.92 },
    ],
  },
  {
    name: "West Jordan and South Jordan",
    role: "distribution",
    waypoints: [
      { lat: 40.63, lng: -112.02 },
      { lat: 40.55, lng: -111.92 },
    ],
  },
  {
    name: "Sandy, Midvale and Draper",
    role: "distribution",
    waypoints: [
      { lat: 40.62, lng: -111.9 },
      { lat: 40.5, lng: -111.83 },
    ],
  },
  {
    name: "Riverton, Herriman and Bluffdale",
    role: "distribution",
    waypoints: [
      { lat: 40.54, lng: -112.04 },
      { lat: 40.47, lng: -111.92 },
    ],
  },
  {
    name: "Kearns and Magna",
    role: "distribution",
    waypoints: [
      { lat: 40.72, lng: -112.1 },
      { lat: 40.65, lng: -112.02 },
    ],
  },
];

/** A stable number in [0,1) from a string, so a re-import draws the same map. */
export function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_003) / 1_000_003;
}

function distanceFt(a: Point, b: Point): number {
  return Math.hypot((b.lat - a.lat) * FT_PER_DEG_LAT, (b.lng - a.lng) * FT_PER_DEG_LNG);
}

/** Total length of a corridor, in feet. */
export function corridorLengthFt(corridor: Corridor): number {
  let total = 0;
  for (let i = 1; i < corridor.waypoints.length; i++) total += distanceFt(corridor.waypoints[i - 1], corridor.waypoints[i]);
  return total;
}

/** The point a given distance along a corridor, and the bearing there. */
export function alongCorridor(corridor: Corridor, distanceAlongFt: number): { point: Point; unit: Point } {
  let remaining = Math.max(0, distanceAlongFt);
  for (let i = 1; i < corridor.waypoints.length; i++) {
    const from = corridor.waypoints[i - 1];
    const to = corridor.waypoints[i];
    const legFt = distanceFt(from, to);
    if (remaining <= legFt || i === corridor.waypoints.length - 1) {
      const t = legFt === 0 ? 0 : Math.min(1, remaining / legFt);
      return {
        point: { lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t },
        // A unit step along this leg, in degrees, for drawing a strand that
        // runs with the corridor rather than across it.
        unit: {
          lat: legFt === 0 ? 0 : (to.lat - from.lat) / legFt,
          lng: legFt === 0 ? 0 : (to.lng - from.lng) / legFt,
        },
      };
    }
    remaining -= legFt;
  }
  const last = corridor.waypoints[corridor.waypoints.length - 1];
  return { point: last, unit: { lat: 0, lng: 0 } };
}

export type Strand = Point[];

/**
 * A band's pipe, drawn as strands totalling its published length.
 *
 * Trunk pipe is laid along a corridor in long runs, offset a little to each
 * side so parallel mains do not draw on top of each other. Distribution pipe
 * is drawn on the street grid inside a city's box — north-south and east-west
 * runs of a few hundred feet, which is what distribution mains look like from
 * above.
 *
 * The strands always sum to the length asked for, so the map and the inventory
 * cannot disagree.
 */
export function drawBand(seed: string, totalLengthFt: number, diameterInches: number | null): Strand[] {
  const trunk = (diameterInches ?? 0) >= 20;
  return trunk ? trunkStrands(seed, totalLengthFt) : gridStrands(seed, totalLengthFt);
}

function trunkStrands(seed: string, totalLengthFt: number): Strand[] {
  const corridors = CORRIDORS.filter((c) => c.role === "trunk");
  const strands: Strand[] = [];
  // Long runs, so a big main reads as one line rather than as dashes: three
  // miles at a time, or the whole band if it is shorter than that.
  const runFt = Math.min(Math.max(totalLengthFt / 6, 3_000), 16_000);
  let left = totalLengthFt;
  let n = 0;

  while (left > 1 && n < 400) {
    const corridor = corridors[Math.floor(hashUnit(`${seed}:c${n}`) * corridors.length) % corridors.length];
    const corridorFt = corridorLengthFt(corridor);
    const thisRun = Math.min(left, runFt);
    const start = hashUnit(`${seed}:s${n}`) * Math.max(1, corridorFt - thisRun);
    const { point, unit } = alongCorridor(corridor, start);

    // Offset perpendicular to the corridor, up to about 400 ft, so parallel
    // mains are distinguishable at zoom.
    const offsetFt = (hashUnit(`${seed}:o${n}`) - 0.5) * 800;
    const perp = { lat: -unit.lng * FT_PER_DEG_LNG, lng: unit.lat * FT_PER_DEG_LAT };
    const perpLen = Math.hypot(perp.lat, perp.lng) || 1;
    const offset = {
      lat: (perp.lat / perpLen) * (offsetFt / FT_PER_DEG_LAT),
      lng: (perp.lng / perpLen) * (offsetFt / FT_PER_DEG_LNG),
    };

    const from = { lat: point.lat + offset.lat, lng: point.lng + offset.lng };
    const end = alongCorridor(corridor, start + thisRun).point;
    const to = { lat: end.lat + offset.lat, lng: end.lng + offset.lng };

    strands.push([from, to]);
    left -= thisRun;
    n++;
  }

  return strands;
}

function gridStrands(seed: string, totalLengthFt: number): Strand[] {
  const boxes = CORRIDORS.filter((c) => c.role === "distribution");
  const strands: Strand[] = [];
  // Distribution runs: a few hundred feet to a third of a mile, which is what
  // a block of main looks like.
  const runFt = Math.min(Math.max(totalLengthFt / 40, 400), 1_800);
  let left = totalLengthFt;
  let n = 0;

  while (left > 1 && n < 900) {
    const box = boxes[Math.floor(hashUnit(`${seed}:b${n}`) * boxes.length) % boxes.length];
    const [corner, opposite] = box.waypoints;
    const lat = Math.min(corner.lat, opposite.lat) + hashUnit(`${seed}:y${n}`) * Math.abs(corner.lat - opposite.lat);
    const lng = Math.min(corner.lng, opposite.lng) + hashUnit(`${seed}:x${n}`) * Math.abs(corner.lng - opposite.lng);
    const thisRun = Math.min(left, runFt);

    // Half the runs north-south, half east-west: the valley's grid.
    const northSouth = hashUnit(`${seed}:d${n}`) < 0.5;
    const from = { lat, lng };
    const to = northSouth
      ? { lat: lat + thisRun / FT_PER_DEG_LAT, lng }
      : { lat, lng: lng + thisRun / FT_PER_DEG_LNG };

    strands.push([from, to]);
    left -= thisRun;
    n++;
  }

  return strands;
}

/** Strands as WKT, for the PostGIS column Prisma cannot address. */
export function strandsToWkt(strands: Strand[]): string {
  const parts = strands
    .filter((s) => s.length >= 2)
    .map((s) => `(${s.map((p) => `${p.lng.toFixed(6)} ${p.lat.toFixed(6)}`).join(", ")})`);
  return `MULTILINESTRING(${parts.join(", ")})`;
}
