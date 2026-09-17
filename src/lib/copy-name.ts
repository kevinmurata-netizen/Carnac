/**
 * The name for a copy: "Relining (copy)", then "Relining (copy 2)" and so on,
 * skipping anything already taken.
 *
 * Copying a copy starts from the original's name rather than stacking up
 * "(copy) (copy)". Compared case-insensitively, the same way the name checks
 * on rules, effects and combinations are. `taken` is updated in place, so
 * copying several at once cannot hand two of them the same name.
 */
export function copyName(name: string, taken: Set<string>): string {
  const base = name.replace(/ \(copy(?: \d+)?\)$/i, "").trim();
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${base} (copy)` : `${base} (copy ${n})`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

/** Names as `copyName` wants them. */
export function takenNames(rows: Array<{ name: string }>): Set<string> {
  return new Set(rows.map((r) => r.name.toLowerCase()));
}
