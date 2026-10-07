/**
 * The phases of a target-constrained run, year by year: the ramp, the target
 * year, then holding the target or doing nothing new.
 *
 * Shared by the scenario page's Annual Spend card and its export, so the two
 * can never label a year differently.
 */
export function targetPhases(
  target: { inYears: number; aimedFor: number | null },
  afterTarget: "hold" | "none"
) {
  /** Where the ramp ends: the year asked for, or the one aimed for instead
   * when the asked year was out of reach. Counted from the start of the run. */
  const aim = target.aimedFor ?? target.inYears;
  const phaseOf = (index: number) =>
    index < aim - 1 ? "Ramp" : index === aim - 1 ? "Target year" : afterTarget === "none" ? "No new work" : "Hold";
  return { aim, phaseOf };
}
