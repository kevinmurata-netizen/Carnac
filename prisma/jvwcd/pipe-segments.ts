/**
 * Turning a diameter band into segments.
 *
 * JVWCD publishes pipe as a summary: 8-inch, 303,335 linear feet. That is one
 * row about roughly six hundred pipes. Imported as it stands it is honest but
 * unusable — the model would rank a single 57-mile "pipe" against a reservoir —
 * so this splits a band into segments on instruction.
 *
 * Two rules hold whatever the configuration says:
 *
 *  1. **The lengths reconcile exactly.** The segments of a band sum to the
 *     band's published total, to the foot. A demo whose totals do not match the
 *     source table is worse than no demo.
 *  2. **Nothing is random.** Splitting the same band twice gives the same
 *     segments, so a re-import does not quietly renumber the network.
 *
 * What it cannot do is make the segments real. A synthesized segment is a
 * plausible share of a band, not a pipe anybody can go and look at, and
 * anything built on it inherits that.
 */

export type SegmentSpec = {
  /** Feet. Must be positive. */
  lengthFt: number;
  /** Appended to the asset code and name, where a band names its segments. */
  label?: string;
  serviceArea?: string;
  pressureZone?: string;
};

export type BandConfig = {
  /** Cut this band into segments of about this length. */
  segmentLengthFt?: number;
  /** Or into exactly this many, of equal length. */
  segmentCount?: number;
  /** Or into these, named and sized by hand. Lengths are treated as shares of
   * the band's published total rather than as absolute feet, so the total still
   * reconciles even when the hand figures do not add up to it. */
  segments?: SegmentSpec[];
};

export type PipeSegmentConfig = {
  /** Used by any band without its own rule. Absent means one asset per band. */
  defaultSegmentLengthFt?: number;
  /** Never make a segment shorter than this; the remainder joins the last one
   * instead. Stops a 300,001-foot band ending in a one-foot pipe. */
  minSegmentLengthFt?: number;
  /** Keyed by the band's diameter as it appears in the CSV — "8", "36". */
  bands?: Record<string, BandConfig>;
};

export const DEFAULT_PIPE_SEGMENT_CONFIG: PipeSegmentConfig = {
  defaultSegmentLengthFt: 2000,
  minSegmentLengthFt: 200,
  bands: {},
};

export type Band = {
  /** As printed in the source table, used to look up its rule. */
  diameter: string;
  totalLengthFt: number;
};

export type SynthesizedSegment = {
  index: number;
  lengthFt: number;
  label?: string;
  serviceArea?: string;
  pressureZone?: string;
};

/**
 * One band's segments, in order.
 *
 * Returns a single segment carrying the whole band when no rule applies, which
 * is the un-synthesized import: the same code path, one row.
 */
export function splitBand(band: Band, config: PipeSegmentConfig = {}): SynthesizedSegment[] {
  const total = Math.round(band.totalLengthFt);
  if (!(total > 0)) return [];

  const rule = config.bands?.[band.diameter] ?? {};
  const minLength = Math.max(1, Math.round(config.minSegmentLengthFt ?? 1));

  // Named segments: the shares are what was asked for, scaled to the band's
  // real total so the two cannot disagree.
  if (rule.segments && rule.segments.length > 0) {
    const shares = rule.segments.map((s) => Math.max(0, s.lengthFt));
    const sum = shares.reduce((a, b) => a + b, 0);
    if (!(sum > 0)) return [{ index: 1, lengthFt: total }];
    const lengths = distribute(total, shares.map((s) => s / sum));
    return rule.segments.map((spec, i) => ({
      index: i + 1,
      lengthFt: lengths[i],
      label: spec.label,
      serviceArea: spec.serviceArea,
      pressureZone: spec.pressureZone,
    }));
  }

  const count = rule.segmentCount
    ? Math.max(1, Math.floor(rule.segmentCount))
    : segmentsFor(total, rule.segmentLengthFt ?? config.defaultSegmentLengthFt, minLength);

  if (count <= 1) return [{ index: 1, lengthFt: total }];
  const lengths = distribute(
    total,
    Array.from({ length: count }, () => 1 / count)
  );
  return lengths.map((lengthFt, i) => ({ index: i + 1, lengthFt }));
}

/** How many segments a target length implies, never leaving a stub shorter
 * than the floor. */
function segmentsFor(total: number, targetLengthFt: number | undefined, minLength: number): number {
  if (!targetLengthFt || targetLengthFt <= 0) return 1;
  const count = Math.max(1, Math.round(total / targetLengthFt));
  return Math.floor(total / count) >= minLength ? count : Math.max(1, Math.floor(total / minLength));
}

/**
 * Whole feet in the given proportions, summing to exactly `total`.
 *
 * The rounding drift is spread a foot at a time rather than dumped on one
 * segment: six hundred segments of 500 ft leave 165 ft over, and giving it all
 * to one of them produced a 335-foot pipe sitting among identical neighbours,
 * which reads as data rather than as arithmetic.
 */
function distribute(total: number, shares: number[]): number[] {
  const lengths = shares.map((s) => Math.round(total * s));
  let drift = total - lengths.reduce((a, b) => a + b, 0);
  const step = drift > 0 ? 1 : -1;
  // Longest first when taking feet away, shortest first when handing them out,
  // so no segment is pushed below its neighbours by the correction.
  const order = [...lengths.keys()].sort((a, b) => (step < 0 ? lengths[b] - lengths[a] : lengths[a] - lengths[b]));
  for (let i = 0; drift !== 0 && lengths.length > 0; i++) {
    const at = order[i % order.length];
    if (step < 0 && lengths[at] <= 1) continue;
    lengths[at] += step;
    drift -= step;
  }
  return lengths;
}

/** What a configuration would produce, for checking before importing anything. */
export function describeSplit(bands: Band[], config: PipeSegmentConfig = {}) {
  const rows = bands.map((band) => {
    const segments = splitBand(band, config);
    const sum = segments.reduce((a, s) => a + s.lengthFt, 0);
    return {
      diameter: band.diameter,
      totalLengthFt: Math.round(band.totalLengthFt),
      segments: segments.length,
      shortestFt: segments.length ? Math.min(...segments.map((s) => s.lengthFt)) : 0,
      longestFt: segments.length ? Math.max(...segments.map((s) => s.lengthFt)) : 0,
      reconciles: sum === Math.round(band.totalLengthFt),
    };
  });
  return {
    rows,
    totalSegments: rows.reduce((a, r) => a + r.segments, 0),
    allReconcile: rows.every((r) => r.reconciles),
  };
}
