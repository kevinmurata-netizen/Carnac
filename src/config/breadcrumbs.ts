import { ASSET_LABEL } from "@/config/labels";

/**
 * Display labels for URL segments. The breadcrumb trail is derived from the
 * path, so every segment a user can reach needs an entry here — anything
 * missing falls back to a title-cased version of the segment itself.
 *
 * Dynamic segments (record ids) are not listed. Pages that own one render
 * <SetBreadcrumb> to supply a real label, e.g. the asset code.
 */
export const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  ask: "AI Assistant",
  network: "Network",
  assets: ASSET_LABEL.plural,
  inspections: "Inspections",
  condition: "Condition",
  risk: "Risk",
  "deterioration-models": "Deterioration Models",
  "treatment-planning": "Treatment Planning",
  "scenario-planning": "Scenario Planning",
  "work-plan": "Work Plan",
  "model-results": "Model Results",
  reports: "Reports",
  filters: "Filters",

  settings: "Settings",
  "condition-index": "Condition Index",
  treatments: "Treatments and Costs",
  configuration: "Configuration",
  "condition-models": "Metrics",
  "risk-models": "Risk Models",
  "decision-trees": "Decision Trees",
  "failure-types": "Failure Types",
  navigation: "Navigation",
  "build-log": "Build Log",
  theme: "Theme",
  map: "Map",
  database: "Database Connection",

  administration: "Administration",
  users: "Users & Roles",
  fields: "Fields",
  import: "Data Import",
  activity: "Activity & Audit",
  wishlist: "Wishlist",

  failures: "Failures",
  new: "New",
};

/** Record ids are cuids; anything matching is a dynamic segment rather than a
 * route name, so it gets a page-supplied label instead of being shown raw. */
export function isRecordId(segment: string): boolean {
  return /^c[a-z0-9]{16,}$/.test(segment);
}

export function labelForSegment(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
