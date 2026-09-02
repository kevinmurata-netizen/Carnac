import { prisma } from "@/lib/prisma";

/**
 * What the map's hover card shows.
 *
 * This module is what the map actually reads: `getNetworkGeoJSON` builds its
 * feature properties from the same field list, so a field turned on here is
 * fetched and shown, and one turned off is not sent to the browser at all.
 */

const KEY = "map.popupFields";

export type MapField = {
  key: string;
  label: string;
  /** Why it might be worth showing, for the settings page. */
  hint: string;
};

/**
 * Everything the hover card can show.
 *
 * The segment code is deliberately absent — it is the card's heading and is
 * always present, so offering it as a toggle would only let someone produce a
 * card with no identity on it.
 */
export const MAP_FIELDS: MapField[] = [
  { key: "status", label: "Status", hint: "Active, Abandoned, Planned…" },
  { key: "material", label: "Material", hint: "Cast Iron, PVC, and so on" },
  { key: "diameter", label: "Diameter (in)", hint: "Nominal bore" },
  { key: "length", label: "Length (ft)", hint: "Segment length" },
  { key: "installYear", label: "Install year", hint: "Year it went in" },
  { key: "age", label: "Age (years)", hint: "Today minus the install date" },
  { key: "condition", label: "Condition (WCI)", hint: "Latest score, worst is 0" },
  { key: "conditionBand", label: "Condition band", hint: "Excellent through Very Poor" },
  { key: "riskScore", label: "Risk score", hint: "Latest assessment, 1–25" },
  { key: "riskBand", label: "Risk band", hint: "Low through Very High" },
  { key: "serviceArea", label: "Service area", hint: "Which part of town" },
  { key: "pressureZone", label: "Pressure zone", hint: "Hydraulic zone" },
  { key: "customersServed", label: "Customers served", hint: "How many connections depend on it" },
  { key: "criticality", label: "Criticality", hint: "Low through Critical" },
];

/** Shown when nothing has been configured: enough to identify a segment and
 * judge whether it matters, without crowding the card. */
export const DEFAULT_POPUP_FIELDS = ["status", "material", "diameter", "condition"];

const VALID = new Set(MAP_FIELDS.map((f) => f.key));

export async function getPopupFields(organizationId: string): Promise<string[]> {
  const row = await prisma.organizationSetting.findUnique({
    where: { organizationId_key: { organizationId, key: KEY } },
    select: { value: true },
  });

  const stored = row?.value;
  if (!Array.isArray(stored)) return DEFAULT_POPUP_FIELDS;

  // Validated on the way out: a field removed from MAP_FIELDS in a later
  // version must not leave a stored row rendering a blank line forever.
  const keys = stored.filter((v): v is string => typeof v === "string" && VALID.has(v));

  // An empty saved list is a real choice — a card with just the segment code.
  return keys;
}

/** Resolved to labels, in the order MAP_FIELDS declares, so the card reads the
 * same way regardless of the order they were ticked. */
export async function getPopupFieldsWithLabels(
  organizationId: string
): Promise<Array<{ key: string; label: string }>> {
  const keys = new Set(await getPopupFields(organizationId));
  return MAP_FIELDS.filter((f) => keys.has(f.key)).map((f) => ({ key: f.key, label: f.label }));
}

export async function setPopupFields(organizationId: string, keys: string[]) {
  const value = MAP_FIELDS.filter((f) => keys.includes(f.key)).map((f) => f.key);

  await prisma.organizationSetting.upsert({
    where: { organizationId_key: { organizationId, key: KEY } },
    create: { organizationId, key: KEY, value },
    update: { value },
  });
}
