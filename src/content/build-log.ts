/**
 * The build log.
 *
 * Entries live in the repository rather than the database on purpose: a log
 * entry describes a change to the code, so it belongs in the commit that made
 * the change, gets reviewed with it, and can never drift out of step with what
 * is actually deployed. It also means no migration and nothing to run against
 * production when an entry is added.
 *
 * Add a new entry at the TOP of ENTRIES as part of the same commit as the work
 * it describes.
 */

export type BuildEntry = {
  /** ISO date the work merged. */
  date: string;
  title: string;
  /** Pull request number on GitHub, when there is one. */
  pr?: number;
  /** One or two sentences a non-developer can read. */
  summary: string;
  /** What changed, in the user's terms. */
  changes: string[];
  /** Bugs found and fixed along the way, worth calling out. */
  fixes?: string[];
  /** Anything that needs doing before or after deploying. */
  note?: string;
};

export const ENTRIES: BuildEntry[] = [
  {
    date: "2026-09-02",
    title: "Stop promising a development phase that already shipped",
    pr: 18,
    summary:
      "The Documents tab said document management would arrive in Phase 8. Phase 8 — reporting and administration — shipped some time ago, and document management was never part of it.",
    changes: [
      "The Documents tab on a segment now says what it will hold and that nothing is stored yet, without naming a phase or a date.",
      "Sidebar entries no longer carry a development phase. Every page is live, so the field fed a badge that never appeared.",
    ],
    note: "No schema change. The documents table still exists and is still unused — this is wording and dead configuration, not the feature itself.",
  },
  {
    date: "2026-09-01",
    title: "Hide pages, unsaved-change markers, a pinned save bar, and drillable model results",
    pr: 17,
    summary:
      "Four changes: tidy the sidebar, see at a glance what you have edited, save without scrolling, and open a model-results row into the segments behind it.",
    changes: [
      "Settings -> Navigation now has a Showing/Hidden toggle per page. Hiding removes it from the sidebar only — the page keeps working and its URL keeps resolving, and a page you are currently on stays visible so you cannot strand yourself.",
      "Editing a record marks each changed field with an amber dot and an amber border, and the footer counts them. Changing a value back to what was stored clears the marker.",
      "Save, Cancel and the lock state now sit in a bar pinned to the bottom of the window, so a change made at the top of a long record can be saved without scrolling to find the button.",
      "Save is disabled until something actually changes, and Cancel becomes Discard changes when there is something to discard.",
      "The Navigation page gets the same pinned bar and unsaved-change count, and marks the rows you changed — an amber dot beside the page name, an outline round the field or the Showing/Hidden toggle, whichever you touched.",
      "Ask is now called AI Assistant. Its address is unchanged, so existing links still work.",
      "On Model Results, clicking a transition row opens the segments behind it — worst final condition first, with start and end WCI, the change, treatments applied, and a link through to each segment.",
    ],
    fixes: [
      "The ten tabs on a segment page wrapped onto three rows but the row kept a one-line height, so on a phone they overlapped the card beneath. Found while checking the new footer on a narrow screen.",
    ],
    note: "Adds a hidden column to navigation_labels, so this one needs a migration before deploying.",
  },
  {
    date: "2026-09-01",
    title: "Ask — questions about the network in plain English",
    pr: 15,
    summary:
      "A new Ask page under Overview. Type a question, get the matching segments back in a grid with clickable Water IDs.",
    changes: [
      "Ask things like 'all 12\" waterlines in Highland Park' or 'cast iron in poor condition serving more than 200 customers'.",
      "Results come back as a grid; the Water ID on each row opens that segment.",
      "The criteria it used are shown above the results, so you can see how it read your question and correct it if it read it wrong.",
      "Questions that are not about the water network are declined rather than answered.",
      "There is no sorting yet, so \"the oldest\" or \"the largest\" is answered by filtering to that range — it tells you when it has done this.",
    ],
    note: "Needs an ANTHROPIC_API_KEY in the environment. Until one is set the page explains what it needs rather than erroring. The assistant never writes database queries — it fills in the same criteria the Filters page produces, over the same curated schema, so it can only reach fields already made filterable.",
  },
  {
    date: "2026-09-01",
    title: "Age is sortable on Water Inventory",
    pr: 14,
    summary: "The Age column now sorts, and shows a plain number rather than \"81 yr\".",
    changes: [
      "Click Age to sort youngest or oldest first, the same as any other column.",
      "The unit is dropped from each cell — the column heading already says Age.",
    ],
    note: "Age is not stored anywhere; it is today minus the installation date. Sorting by age is therefore the exact inverse of sorting by install date, which is how it is done rather than by adding a column that would go stale.",
  },
  {
    date: "2026-08-25",
    title: "Decision trees moved out of Treatments, and this build log",
    pr: 13,
    summary:
      "Decision trees are now their own page, rebuilt around grouped AND/OR conditions instead of a binary tree. This build log is the other half of the change.",
    changes: [
      "Decision Trees is its own card under Settings → Modeling. Pick a treatment, then add as many named rules to it as you need.",
      "A rule is a set of conditions joined by Match all or Match any, and groups can be nested, so precedence is something you can see rather than infer.",
      "Operators: is, is not, greater than, at least, less than, at most, between, is one of, is not one of, has no value, has a value.",
      "Values are chosen from a dropdown where the inventory has a fixed set — materials and criticality come from what your segments actually hold.",
      "Where a treatment has several rules, you choose whether an asset qualifies by matching any one of them or all of them.",
      "Every rule can be tested against five real segments spread across the condition range, with a trace showing which conditions passed and what the segment actually held.",
      "The decision tree section is gone from the Treatments page, which now links across to the new one.",
      "Build Log added under Settings → Administration — this page.",
    ],
    fixes: [
      "The existing Relining rule, written in the old binary format, is converted rather than dropped; it gates exactly the same segments as before.",
    ],
    note: "No database migration.",
  },
  {
    date: "2026-08-25",
    title: "Saved filters on the grids, column sorting, editable records",
    pr: 12,
    summary:
      "The filters saved on the Filters page become usable across the app, grids gained sorting, and records can now be edited in place.",
    changes: [
      "Saved filter dropdown on Water Inventory, Network and Inspections.",
      "Column sorting on every grid — click for ascending, again for descending, a third time to clear.",
      "Per-column filter dropdowns, with sort and filter both held in the URL so a view is a link you can send.",
      "Inspections gained the same add-a-field filter bar as the asset pages: inspector, date range, minimum quality, follow-up.",
      "Asset and inspection pages open read-only with an Unlock to edit toggle and a Save button. Executives stay read-only.",
      "Editing a condition rating recalculates the inspection's WCI rather than leaving the old score in place.",
    ],
    fixes: [
      "Dates were rendered in the server's timezone but stored as UTC, so every calendar date showed a day early on machines behind UTC.",
    ],
  },
  {
    date: "2026-08-25",
    title: "More filter fields, tab-aware breadcrumbs, and a Theme card",
    pr: 11,
    summary: "Filter bars gained an Add a filter dropdown, breadcrumbs learned which Settings tab a page belongs to, and the theme became configurable.",
    changes: [
      "Add a filter dropdown on the Assets and Network filter bars: criticality, customer type, pressure zone, and ranges for diameter, customers served and install year.",
      "Breadcrumbs now name the tab a page came from, so Settings → Modeling → Metrics goes back where you started.",
      "Theme card under Settings → General: light and dark mode plus accent colours.",
    ],
    fixes: [
      "Material and diameter filters were overwriting each other, so combining them silently dropped the material. Cast Iron plus 12–24″ returned 85 segments; it now returns 30.",
      "The same overwrite existed for pressure zone against service area.",
    ],
  },
  {
    date: "2026-08-25",
    title: "Settings reorganised into four tabs",
    pr: 10,
    summary: "Administration stopped being a separate page; everything it held moved into Settings.",
    changes: [
      "Four tabs: General, Administration, Database and Modeling, with General as the default.",
      "System in the sidebar is down to Reports and Settings.",
      "Sidebar items are indented under their section, and section titles can be renamed on the Navigation page.",
      "The tab is held in the URL, so it is linkable and survives a refresh.",
      "Old /administration links redirect rather than breaking.",
    ],
  },
  {
    date: "2026-08-25",
    title: "A filter builder, with saved filters",
    pr: 9,
    summary: "A Filters page for picking columns, setting criteria and saving the result under a name the team shares.",
    changes: [
      "Collapsible, searchable schema tree — tick a field or drag it into the column list.",
      "Drag to reorder columns, numbered so the output order is explicit.",
      "Eleven operators, with match all or match any.",
      "Run to see matching segments with a count, and export to CSV.",
      "Save, update and delete named filters, shared across the team and attributed.",
    ],
    note: "Built over a curated 48-field schema rather than the raw tables, which hold credentials and database plumbing.",
  },
];

export function entryCount(): number {
  return ENTRIES.length;
}

export function latestEntry(): BuildEntry | undefined {
  return ENTRIES[0];
}
