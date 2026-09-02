import { ASSET_LABEL } from "@/config/labels";

export type NavItem = {
  label: string;
  href: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "AI Assistant", href: "/ask" },
      { label: "Network", href: "/network" },
      { label: ASSET_LABEL.plural, href: "/assets" },
    ],
  },
  {
    label: `${ASSET_LABEL.singular} Management`,
    items: [
      { label: "Inspections", href: "/inspections" },
      { label: "Condition", href: "/condition" },
      { label: "Risk", href: "/risk" },
      { label: "Deterioration Models", href: "/deterioration-models" },
    ],
  },
  {
    label: "Planning",
    items: [
      { label: "Treatment Planning", href: "/treatment-planning" },
      { label: "Scenario Planning", href: "/scenario-planning" },
      { label: "Work Plan", href: "/work-plan" },
      { label: "Model Results", href: "/model-results" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Reports", href: "/reports" },
      { label: "Settings", href: "/settings" },
    ],
  },
];
