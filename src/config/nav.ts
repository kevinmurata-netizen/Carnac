import { ASSET_LABEL } from "@/config/labels";

export type NavItem = {
  label: string;
  href: string;
  /** Phase this capability shipped in, for reference. */
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** True once the screen is fully functional. Items that aren't live yet
   * render a clear "coming in a later phase" placeholder instead of a
   * fake/broken screen, and show a "Phase N" badge in the sidebar. */
  live: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", phase: 1, live: true },
      { label: "Network", href: "/network", phase: 1, live: true },
      { label: ASSET_LABEL.plural, href: "/assets", phase: 1, live: true },
    ],
  },
  {
    label: `${ASSET_LABEL.singular} Management`,
    items: [
      { label: "Inspections", href: "/inspections", phase: 2, live: true },
      { label: "Condition", href: "/condition", phase: 2, live: true },
      { label: "Risk", href: "/risk", phase: 3, live: true },
      { label: "Deterioration Models", href: "/deterioration-models", phase: 4, live: true },
    ],
  },
  {
    label: "Planning",
    items: [
      { label: "Treatment Planning", href: "/treatment-planning", phase: 5, live: true },
      { label: "Scenario Planning", href: "/scenario-planning", phase: 6, live: true },
      { label: "Work Plan", href: "/work-plan", phase: 7, live: true },
      { label: "Model Results", href: "/model-results", phase: 8, live: true },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Filters", href: "/filters", phase: 8, live: true },
      { label: "Reports", href: "/reports", phase: 8, live: true },
      { label: "Settings", href: "/settings", phase: 8, live: true },
      { label: "Administration", href: "/administration", phase: 8, live: true },
    ],
  },
];
