/**
 * The sidebar's default names. A label may carry the asset words as
 * placeholders — "{Assets}", "{Asset} Management" — which read as the
 * organization's branding (lib/branding.ts withAssetWords). A renamed page or
 * section keeps its own name.
 */
export type NavItem = {
  label: string;
  href: string;
};

export type NavGroup = {
  /** Stable identity: what a renamed or hidden section is stored against.
   * The section's original title, kept even where the title now follows the
   * branding, so renames made before keep applying. */
  key: string;
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "Overview",
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "AI Assistant", href: "/ask" },
      { label: "Network", href: "/network" },
      { label: "{Assets}", href: "/assets" },
    ],
  },
  {
    key: "Water Management",
    label: "{Asset} Management",
    items: [
      { label: "Inspections", href: "/inspections" },
      { label: "Condition", href: "/condition" },
      { label: "Risk", href: "/risk" },
      { label: "Deterioration Models", href: "/deterioration-models" },
    ],
  },
  {
    key: "Planning",
    label: "Planning",
    items: [
      { label: "Treatment Planning", href: "/treatment-planning" },
      { label: "Scenario Planning", href: "/scenario-planning" },
      { label: "Work Plan", href: "/work-plan" },
      { label: "Model Results", href: "/model-results" },
    ],
  },
  {
    key: "System",
    label: "System",
    items: [
      { label: "Reports", href: "/reports" },
      { label: "Settings", href: "/settings" },
    ],
  },
];
