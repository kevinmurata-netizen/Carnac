/**
 * What the screens call the measures the engine reads, and the units they
 * are recorded in.
 *
 * Each modelled asset type says which of its attributes is its size and
 * which its length (Settings › Asset Types), and each attribute carries its
 * own label and unit — "Diameter", in; "Length", ft. Headings and values are
 * written from those, so a pole network measured in metres reads in metres.
 *
 * Kept free of the database so client components can use it.
 */

export type MeasureLabel = {
  /** The attribute's label: "Diameter". */
  name: string;
  /** Its unit, as recorded: "in", "ft". Null when it has none. */
  unit: string | null;
  /** A column heading carrying the unit: "Diameter (in)". */
  heading: string;
};

/** The measures the screens label: an asset's size and its length. */
export type MeasureLabels = { diameter: MeasureLabel; length: MeasureLabel };

export function measureLabel(name: string, unit: string | null): MeasureLabel {
  const clean = unit?.trim() || null;
  return { name, unit: clean, heading: clean ? `${name} (${clean})` : name };
}

/** For a screen spanning types that measure differently — the roles' own names. */
export const GENERIC_MEASURE_LABELS: MeasureLabels = {
  diameter: measureLabel("Size", null),
  length: measureLabel("Length", null),
};

/** Text written with "{diameter}" and "{length}" where the headings go —
 * column headings kept as constants. */
export function withMeasures(text: string, labels: MeasureLabels): string {
  return text.replaceAll("{diameter}", labels.diameter.heading).replaceAll("{length}", labels.length.heading);
}

/** A measured value with its unit: 12", 340 ft, 2.5 m. Inches keep the
 * inch mark the network has always been read in. */
export function formatMeasure(value: number | null | undefined, label: MeasureLabel, digits?: number): string {
  if (value == null) return "—";
  const shown = digits == null ? String(value) : value.toLocaleString("en-US", { maximumFractionDigits: digits });
  if (!label.unit) return shown;
  if (label.unit === "in") return `${shown}"`;
  return `${shown} ${label.unit}`;
}

/** A network's total length: feet as miles and metres as kilometres, as a
 * network is spoken of; anything else in its own unit. */
export function formatTotalLength(total: number, label: MeasureLabel): string {
  if (label.unit === "ft") return `${(total / 5280).toFixed(1)} mi`;
  if (label.unit === "m") return `${(total / 1000).toFixed(1)} km`;
  return formatMeasure(Math.round(total), label, 0);
}
