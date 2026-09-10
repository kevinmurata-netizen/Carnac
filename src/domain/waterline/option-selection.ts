import type { TreatmentOption } from "./treatment";

/**
 * Which options a scenario is allowed to consider.
 *
 * The question this answers is "what would a relining-only program fund?",
 * and until now the only way to ask it was to disable treatments across the
 * whole library and remember to put them back — which changes what every other
 * scenario means and cannot be compared against anything.
 *
 * Null means no restriction. That is a different statement from an empty set,
 * which means "consider nothing", and the two must not collapse: someone who
 * unticks every box and gets the full library back has been told the opposite
 * of the truth.
 */
export type OptionSelection = {
  /** Treatment names, matching `TreatmentOption.label` for a lone treatment. */
  treatments: ReadonlySet<string>;
  /** Combination ids, matching the `combo:<id>` half of an option id. */
  combinations: ReadonlySet<string>;
} | null;

/** Consider everything — what every scenario did before this existed. */
export const CONSIDER_ALL: OptionSelection = null;

/**
 * Whether one built option survives the selection.
 *
 * Filtering happens on the built option rather than on the library fed into
 * `enumerateOptions`, and that is the design decision worth stating. Filtering
 * the inputs would mean a combination could only be considered when every one
 * of its members was also selected, so "run this bundle and nothing else"
 * would be inexpressible — and it is one of the things someone most wants to
 * ask. Here a combination stands or falls on its own.
 */
export function allowsOption(selection: OptionSelection, option: TreatmentOption): boolean {
  if (selection == null) return true;

  if (option.id.startsWith("combo:")) {
    return selection.combinations.has(option.id.slice("combo:".length));
  }
  return selection.treatments.has(option.label);
}

/** Convenience for the several callers that hold a list. */
export function filterOptions(selection: OptionSelection, options: TreatmentOption[]): TreatmentOption[] {
  if (selection == null) return options;
  return options.filter((o) => allowsOption(selection, o));
}
