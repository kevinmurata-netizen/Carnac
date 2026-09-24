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

/** Sampled along a corridor so a long run bends with the valley instead of
 * cutting across it as one straight line. */
function traceCorridor(corridor: Corridor, fromFt: number, lengthFt: number, offsetFt: number): Strand {
  // Sampled every 2,000 ft, and always including the end: a 254 ft band is
  // shorter than one step, and sampling alone gave it a single point and no
  // geometry at all.
  const stepFt = 2_000;
  const distances: number[] = [];
  for (let at = 0; at < lengthFt; at += stepFt) distances.push(at);
  distances.push(lengthFt);

  const points: Point[] = [];
  for (const at of distances) {
    const { point, unit } = alongCorridor(corridor, fromFt + at);
    // Perpendicular to the corridor here, so parallel mains stay parallel
    // through a bend rather than crossing at it.
    const perp = { lat: -unit.lng * FT_PER_DEG_LNG, lng: unit.lat * FT_PER_DEG_LAT };
    const perpLen = Math.hypot(perp.lat, perp.lng) || 1;
    points.push({
      lat: point.lat + (perp.lat / perpLen) * (offsetFt / FT_PER_DEG_LAT),
      lng: point.lng + (perp.lng / perpLen) * (offsetFt / FT_PER_DEG_LNG),
    });
  }
  return points.length >= 2 ? points : [];
}

/** Guards against a band silently drawing nothing, which is how four of them
 * disappeared from the map when the sampling step was longer than the band. */
export function bandDrawsSomething(strands: Strand[]): boolean {
  return strands.some((s) => s.length >= 2);
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

    // Offset perpendicular to the corridor, up to about 400 ft, so parallel
    // mains are distinguishable at zoom.
    const offsetFt = (hashUnit(`${seed}:o${n}`) - 0.5) * 800;
    const strand = traceCorridor(corridor, start, thisRun, offsetFt);
    if (strand.length >= 2) strands.push(strand);
    left -= thisRun;
    n++;
  }

  return strands;
}

/**
 * Distribution pipe as mains that run along a street and turn at a junction.
 *
 * The first version of this drew each run as one straight dash, which meant a
 * band of 300,000 ft arrived as 169 identical sticks scattered over the valley
 * — debris rather than a network. A main is a path: a few blocks one way, a
 * corner, a few blocks the other, which is what this walks.
 *
 * Every main stays inside its city's box by turning back when it reaches the
 * edge, and the lengths still sum to the band's published total.
 */
function gridStrands(seed: string, totalLengthFt: number): Strand[] {
  const boxes = CORRIDORS.filter((c) => c.role === "distribution");
  const strands: Strand[] = [];
  // About thirty mains for a large band, each a mile or two; a small band
  // keeps its one short main rather than being stretched into a tour.
  const mainFt = Math.min(Math.max(totalLengthFt / 30, 1_200), 14_000);
  let left = totalLengthFt;
  let main = 0;

  while (left > 1 && main < 200) {
    const box = boxes[Math.floor(hashUnit(`${seed}:b${main}`) * boxes.length) % boxes.length];
    const [corner, opposite] = box.waypoints;
    const minLat = Math.min(corner.lat, opposite.lat);
    const maxLat = Math.max(corner.lat, opposite.lat);
    const minLng = Math.min(corner.lng, opposite.lng);
    const maxLng = Math.max(corner.lng, opposite.lng);

    let at: Point = {
      lat: minLat + hashUnit(`${seed}:y${main}`) * (maxLat - minLat),
      lng: minLng + hashUnit(`${seed}:x${main}`) * (maxLng - minLng),
    };
    const path: Point[] = [at];

    let northSouth = hashUnit(`${seed}:d${main}`) < 0.5;
    let sign = hashUnit(`${seed}:s${main}`) < 0.5 ? 1 : -1;
    let mainLeft = Math.min(left, mainFt);
    let block = 0;

    while (mainLeft > 1 && block < 60) {
      // A block of main: a few hundred feet to a third of a mile.
      const blockFt = Math.min(mainLeft, 600 + hashUnit(`${seed}:l${main}:${block}`) * 1_000);
      const step = northSouth
        ? { lat: (sign * blockFt) / FT_PER_DEG_LAT, lng: 0 }
        : { lat: 0, lng: (sign * blockFt) / FT_PER_DEG_LNG };
      let next = { lat: at.lat + step.lat, lng: at.lng + step.lng };

      // At the edge of the city, turn back rather than run out into the desert.
      if (next.lat < minLat || next.lat > maxLat || next.lng < minLng || next.lng > maxLng) {
        sign = -sign;
        next = { lat: at.lat - step.lat, lng: at.lng - step.lng };
      }

      path.push(next);
      at = next;
      mainLeft -= blockFt;
      left -= blockFt;
      block++;

      // Corners: often enough to look like streets, not so often that the main
      // becomes a spiral.
      if (hashUnit(`${seed}:t${main}:${block}`) < 0.45) {
        northSouth = !northSouth;
        sign = hashUnit(`${seed}:u${main}:${block}`) < 0.5 ? 1 : -1;
      }
    }

    if (path.length >= 2) strands.push(path);
    main++;
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
