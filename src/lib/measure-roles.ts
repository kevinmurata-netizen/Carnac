/**
 * The measures the engine reads, by role — kept free of the database so the
 * Asset Types screen can list them in the browser. Which attribute plays each
 * role is set per asset type; see src/server/measures.ts.
 */

export const MEASURE_ROLES = [
  {
    key: "material",
    label: "Material",
    kind: "text",
    purpose: "Picks the deterioration curve, and is a probability-of-failure factor.",
  },
  {
    key: "diameter",
    label: "Size",
    kind: "number",
    purpose: "A consequence-of-failure factor, and the size bands cost rates are priced by.",
  },
  {
    key: "length",
    label: "Length",
    kind: "number",
    purpose: "What cost rates are priced per.",
  },
  {
    key: "customersServed",
    label: "Customers served",
    kind: "number",
    purpose: "A consequence-of-failure factor.",
  },
  {
    key: "criticality",
    label: "Criticality rating",
    kind: "text",
    purpose: "A consequence-of-failure factor.",
  },
  {
    key: "customerType",
    label: "Customer type",
    kind: "text",
    purpose: "A consequence-of-failure factor.",
  },
] as const;

export type MeasureRole = (typeof MEASURE_ROLES)[number]["key"];

/** Which attribute code plays each role for one asset type. */
export type MeasureCodes = Partial<Record<MeasureRole, string>>;
