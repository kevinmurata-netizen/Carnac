/**
 * What a component type records about each component of its kind.
 *
 * Stored as JSON Schema on ComponentType.attributeSchema, because that is what
 * validates a component's `attributes` JSON. People don't write JSON Schema,
 * so the settings screen speaks in the five kinds below and this module
 * translates both ways. Anything else a schema says about a property — a
 * minimum, a format — is kept untouched when attributes are added or removed.
 */

export const COMPONENT_ATTRIBUTE_KINDS = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "integer", label: "Whole number" },
  { value: "boolean", label: "Yes / no" },
  { value: "choice", label: "Choice" },
] as const;

export type ComponentAttributeKind = (typeof COMPONENT_ATTRIBUTE_KINDS)[number]["value"];

export type ComponentAttribute = {
  /** The key in a component's `attributes` JSON. Fixed once created. */
  key: string;
  label: string;
  kind: ComponentAttributeKind;
  /** A choice's allowed values; empty for every other kind. */
  options: string[];
};

export type NewComponentAttribute = { label: string; kind: ComponentAttributeKind; options: string[] };

type Property = { type?: string; enum?: unknown[]; title?: string; [keyword: string]: unknown };
type Schema = { type?: string; properties?: Record<string, Property>; [keyword: string]: unknown };

export function kindLabel(kind: ComponentAttributeKind): string {
  return COMPONENT_ATTRIBUTE_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** "wallThicknessIn" → "Wall thickness in", for a property with no title. */
function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function kindOf(p: Property): ComponentAttributeKind {
  if (Array.isArray(p.enum) && p.enum.length > 0) return "choice";
  if (p.type === "number" || p.type === "integer" || p.type === "boolean") return p.type;
  return "text";
}

/**
 * Properties in the order they were written. Postgres keeps jsonb keys sorted
 * by length, not as entered, so each property carries its place in
 * `propertyOrder`; one without it (hand-written, or seeded) keeps its stored
 * position after those that have one.
 */
function ordered(properties: Record<string, Property>): Array<[string, Property]> {
  return Object.entries(properties)
    .map((entry, i) => ({ entry, rank: typeof entry[1].propertyOrder === "number" ? entry[1].propertyOrder : 1e6 + i }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.entry);
}

export function attributesOf(schema: unknown): ComponentAttribute[] {
  const properties = (schema as Schema | null)?.properties ?? {};
  return ordered(properties).map(([key, p]) => ({
    key,
    label: typeof p.title === "string" && p.title.trim() ? p.title : humanize(key),
    kind: kindOf(p),
    options: Array.isArray(p.enum) ? p.enum.map(String) : [],
  }));
}

/** "Wall thickness (in)" → "wallThicknessIn". */
export function attributeKey(label: string): string {
  const words = label
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const key = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
  return /^[0-9]/.test(key) ? `a${key}` : key;
}

export type ComponentAttributeValue = string | number | boolean;

/**
 * A component's attribute values from form strings, checked against what its
 * type says it records. A blank leaves the attribute unrecorded; a key the
 * type doesn't define is refused rather than stored with nothing to describe it.
 */
export function coerceComponentAttributes(
  attributes: ComponentAttribute[],
  raw: Record<string, string>
): Record<string, ComponentAttributeValue> {
  const byKey = new Map(attributes.map((a) => [a.key, a]));
  const out: Record<string, ComponentAttributeValue> = {};
  for (const [key, input] of Object.entries(raw)) {
    const a = byKey.get(key);
    if (!a) throw new Error(`"${key}" is not something this component records`);
    const text = input.trim();
    if (text === "") continue;
    switch (a.kind) {
      case "number":
      case "integer": {
        const n = Number(text);
        if (!Number.isFinite(n) || (a.kind === "integer" && !Number.isInteger(n))) {
          throw new Error(`${a.label} must be ${a.kind === "integer" ? "a whole number" : "a number"}`);
        }
        out[key] = n;
        break;
      }
      case "boolean":
        out[key] = text === "true" || text === "on" || text === "Yes";
        break;
      case "choice":
        if (!a.options.includes(text)) throw new Error(`"${text}" is not one of the ${a.label} options`);
        out[key] = text;
        break;
      default:
        out[key] = text;
    }
  }
  return out;
}

/** An attribute value as a person reads it. */
export function formatComponentAttribute(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function propertyFor(a: NewComponentAttribute): Property {
  const title = a.label.trim();
  if (a.kind === "choice") return { type: "string", enum: a.options, title };
  if (a.kind === "text") return { type: "string", title };
  return { type: a.kind, title };
}

/**
 * The schema with some attributes removed and others added. Properties that
 * stay are carried over exactly as they were.
 */
export function editAttributes(
  schema: unknown,
  edit: { remove?: string[]; add?: NewComponentAttribute[] }
): Schema {
  const base = (schema && typeof schema === "object" ? schema : {}) as Schema;
  const remove = new Set(edit.remove ?? []);
  // Every property is renumbered, so the order read back is the order shown.
  const properties: Record<string, Property> = {};
  for (const [key, p] of ordered(base.properties ?? {})) {
    if (!remove.has(key)) properties[key] = { ...p, propertyOrder: Object.keys(properties).length };
  }

  for (const a of edit.add ?? []) {
    const label = a.label.trim();
    if (!label) throw new Error("Every attribute needs a name");
    const key = attributeKey(label);
    if (!key) throw new Error(`"${label}" needs at least one letter or digit`);
    if (properties[key]) throw new Error(`There is already an attribute called "${label}"`);
    if (a.kind === "choice" && a.options.length === 0) throw new Error(`"${label}" is a choice, so it needs options`);
    properties[key] = { ...propertyFor(a), propertyOrder: Object.keys(properties).length };
  }

  return { ...base, type: "object", properties };
}
