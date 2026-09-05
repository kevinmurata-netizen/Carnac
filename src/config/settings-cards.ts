import {
  Activity,
  Compass,
  Database,
  FileUp,
  Filter,
  GitBranch,
  Gauge,
  KeyRound,
  Layers,
  Map as MapIcon,
  Palette,
  ListChecks,
  ListTodo,
  ShieldAlert,
  ScrollText,
  ShieldCheck,
  Target,
  TrendingDown,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Every card on the Settings tabs, in one list.
 *
 * This is the single source of truth for two things that used to be written out
 * separately: what the Settings page renders, and what an Administrator can
 * grant or withhold per role. Adding a card here makes it appear on its tab
 * *and* gives it a permissions row — so a new card can never quietly ship
 * without access control, which is exactly the failure mode a hand-maintained
 * second list invites.
 *
 * A card and the page behind it are one permission, not two. Every card links
 * to a page reachable only through it, so splitting them would mean two rows
 * that can contradict each other with no way to act on the contradiction.
 */

export const SETTINGS_TABS = [
  { key: "general", label: "General" },
  { key: "administration", label: "Administration" },
  { key: "database", label: "Database" },
  { key: "modeling", label: "Modeling" },
] as const;

export type SettingsTabKey = (typeof SETTINGS_TABS)[number]["key"];

export type SettingsCard = {
  /** Stable identity, used for the permission resource key and the summary
   * lookup. Never reuse one for a different card. */
  key: string;
  href: string;
  tab: SettingsTabKey;
  /** The name in code; a per-organization rename overrides it. */
  title: string;
  icon: LucideIcon;
  detail: string;
};

export const SETTINGS_CARDS: SettingsCard[] = [
  // ---- General ----
  {
    key: "configuration",
    href: "/settings/configuration",
    tab: "general",
    title: "Configuration",
    icon: Layers,
    detail:
      "Asset classes, the inventory attributes recorded against them, and the inspection forms used in the field.",
  },
  {
    key: "navigation",
    href: "/settings/navigation",
    tab: "general",
    title: "Navigation",
    icon: Compass,
    detail:
      "Rename any page or sidebar section. The sidebar, breadcrumb trail and page heading all follow; URLs stay as they are.",
  },
  {
    key: "filters",
    href: "/filters",
    tab: "general",
    title: "Filters",
    icon: Filter,
    detail:
      "Pick columns from the schema, set criteria, and save the result as a named filter the team can reuse.",
  },
  {
    key: "theme",
    href: "/settings/theme",
    tab: "general",
    title: "Theme",
    icon: Palette,
    detail: "Set how the app looks on this device. Follows your operating system unless you choose otherwise.",
  },
  {
    key: "map",
    href: "/settings/map",
    tab: "general",
    title: "Map",
    icon: MapIcon,
    detail: "What the hover card shows on the Network Map, previewed against a real segment.",
  },
  {
    key: "activity",
    href: "/administration/activity",
    tab: "general",
    title: "Activity & Audit",
    icon: ShieldCheck,
    detail: "Derived from the created and updated timestamps carried on the records themselves.",
  },

  // ---- Administration ----
  {
    key: "users",
    href: "/administration/users",
    tab: "administration",
    title: "Users",
    icon: Users,
    detail: "Add people, assign a role, reset passwords and deactivate accounts.",
  },
  {
    key: "roles",
    href: "/administration/roles",
    tab: "administration",
    title: "Roles & Permissions",
    icon: KeyRound,
    detail: "What each role can open, change, and see in the sidebar — page by page and card by card.",
  },
  {
    key: "wishlist",
    href: "/administration/wishlist",
    tab: "administration",
    title: "Wishlist",
    icon: ListTodo,
    detail: "A shared list anyone signed in can add to, tick off or edit.",
  },
  {
    key: "build-log",
    href: "/settings/build-log",
    tab: "administration",
    title: "Build Log",
    icon: ScrollText,
    detail: "Written alongside each change, so it never drifts from what is actually deployed.",
  },

  // ---- Database ----
  {
    key: "database",
    href: "/settings/database",
    tab: "database",
    title: "Database Connection",
    icon: Database,
    detail:
      "Read from the live connection, so a stale connection string shows as unreachable rather than silently reporting health.",
  },
  {
    key: "fields",
    href: "/administration/fields",
    tab: "database",
    title: "Fields",
    icon: ListChecks,
    detail: "What inspectors are asked, and what the inventory records against each segment.",
  },
  {
    key: "import",
    href: "/administration/import",
    tab: "database",
    title: "Data Import",
    icon: FileUp,
    detail: "Validated in full before anything is written, so a bad row cannot half-import a file.",
  },

  // ---- Modeling ----
  {
    key: "condition-index",
    href: "/settings/condition-index",
    tab: "modeling",
    title: "Condition Index",
    icon: Gauge,
    detail: "Which inspection fields feed the score and how much each one counts.",
  },
  {
    key: "condition-models",
    href: "/settings/condition-models",
    tab: "modeling",
    title: "Metrics",
    icon: Gauge,
    detail: "The bands that turn a score into a grade, plus metrics built on any numeric field.",
  },
  {
    key: "treatments",
    href: "/settings/treatments",
    tab: "modeling",
    title: "Treatments and Costs",
    icon: Wrench,
    detail:
      "Unit costs, mobilization and maintenance, condition and risk effects, and applicability rules.",
  },
  {
    key: "decision-trees",
    href: "/settings/decision-trees",
    tab: "modeling",
    title: "Treatment Rules",
    icon: GitBranch,
    detail:
      "Grouped AND/OR rules deciding whether an asset qualifies for a treatment, on top of its technical window.",
  },
  {
    key: "deterioration-models",
    href: "/settings/deterioration-models",
    tab: "modeling",
    title: "Deterioration Models",
    icon: TrendingDown,
    detail: "Service life and curve shape per material, and the Markov transition matrix.",
  },
  {
    key: "criticality",
    href: "/settings/criticality",
    tab: "modeling",
    title: "Criticality",
    icon: Target,
    detail:
      "Formulas that work out how much each asset matters, from its own fields and basic maths. Criticality is what ranks the projects a work plan funds first.",
  },
  {
    key: "risk-models",
    href: "/settings/risk-models",
    tab: "modeling",
    title: "Risk Models",
    icon: ShieldAlert,
    detail: "How much each factor counts toward probability and consequence of failure.",
  },
  {
    key: "failure-types",
    href: "/settings/failure-types",
    tab: "modeling",
    title: "Failure Types",
    icon: Activity,
    detail: "Reference data for recording what went wrong when a segment fails.",
  },
];

/** Lookup by the href a page knows about itself. */
export const CARD_BY_HREF = new Map(SETTINGS_CARDS.map((c) => [c.href, c]));
