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
    date: "2026-09-04",
    title: "Write your own criticality formula",
    pr: 25,
    summary:
      "Settings → Modeling → Criticality is a new screen for defining how much an asset matters, using that asset type's own fields and basic maths. Criticality is what ranks which projects a work plan funds first.",
    changes: [
      "Write a formula like clamp((CUSTOMERS_SERVED / 20) + CRITICALITY * 8, 0, 100). Click any field on the left to drop it in; brackets, + − × ÷ and min, max, clamp and round are all available.",
      "Dropdowns can be used too. Say what each value is worth — Institutional 6, Residential 1 — and only the dropdowns your formula actually mentions ask to be filled in.",
      "Try it on every asset before saving. You get the spread of scores, which segments would rank first and last, and a warning if any asset is missing a value the formula reads, which is how you catch a dropdown value nobody gave a number to.",
      "Formulas are per asset type, so pipes and pumps can be scored on entirely different things. Several can exist side by side and one is active — an alternative can be written and tried out without disturbing the one in use.",
      "Every score records which formula produced it and what went in, so a number on an asset can always be explained.",
    ],
    note: "Needs a migration before deploying — it adds a criticality_models table. Nothing changes until a formula is made active: an asset type without one keeps the previous behaviour, where criticality is a rescale of the risk model's consequence-of-failure rating. Scores are worked out when the model next runs, not when the formula is saved.",
  },
  {
    date: "2026-09-04",
    title: "Set what each role can open, change and see",
    pr: 24,
    summary:
      "Users and Roles are now two separate cards, and Roles & Permissions is a real screen: a grid where an Administrator sets read, write and visible for every page and every Settings card, one role at a time.",
    changes: [
      "Three switches per row, because they answer three different questions. Read opens the page. Write allows changes. Visible only decides whether the entry shows in the sidebar or the Settings grid — a hidden page still opens from a bookmark, which is what hiding has always meant here.",
      "Write is enforced when a change is submitted, not by hiding buttons. Removing someone's write access while they have the form open means their next save is refused.",
      "Unticking Read greys out the other two and clears them — being allowed to change a page you cannot open is not a state worth being able to express.",
      "Per-section All / Read only / None buttons, so setting up a role does not mean forty individual clicks.",
      "Administrator is deliberately fixed at full access. Somebody has to be able to undo a mistake, and a screen that lets you remove your own access to the screen that grants access is a trap.",
      "A page closed to your role says so, names the page, and points at who can change it — rather than pretending the page does not exist.",
      "Settings cards are now defined in one list that the Settings page and this permissions grid both read, so a card added later cannot quietly ship without access control.",
      "Roles can be created, renamed and — for ones you added yourself — deleted. A new role can start from the defaults or as a copy of an existing role, which brings across exactly what that role can reach today.",
      "Any role can be renamed, including Administrator. Each role carries a fixed internal code that nothing displays and nothing can edit, and every decision the system makes reads that code rather than the name — so calling Administrator something else changes the label and nothing else.",
      "The four built-in roles can be renamed but not deleted, and a role with people still assigned to it cannot be deleted until they are moved.",
    ],
    fixes: [
      "The Map settings page had no card anywhere on the Settings screen, so the only way to reach it was to know the URL. It now has one, on the General tab.",
      "The breadcrumb's page-to-tab list was a second hand-maintained copy of the same information; it now derives from the card list, so a page can no longer be breadcrumbed into one tab while its card sits on another.",
      "Two roles whose names differed only in capitalisation could both be created — \"Field Supervisor\" and \"field supervisor\" would sit in the list looking like the same role twice. Names are now compared without regard to case.",
    ],
    note: "Needs a migration before deploying — it adds a role_permissions table and gives roles a code. The migration must run before this code goes live: every page reads the new role code, so deploying first would leave the site erroring until the column exists. Permissions themselves start empty, and empty means exactly the behaviour that was there before (everyone can read everything, only an Administrator changes settings, and everyone except Executive can still record field data). Permissions are stored only where they differ from that default, so unticking one box stores one row.",
  },
  {
    date: "2026-09-04",
    title: "Model Results: exports where the data is, and rows in the graph's order",
    pr: 23,
    summary:
      "The Export to Excel button moved into the Transitions section, each opened transition can be exported on its own, and the table now reads in the same order as the diagram above it.",
    changes: [
      "Export to Excel sits at the top of the Transitions section rather than the page header, so what a download contains is clear from where the button is.",
      "Opening a transition gives that grid its own Export these button — a file of just those segments, named for the path (for example current-funding-poor-to-excellent.xlsx).",
      "Transitions are sorted the way the diagram stacks them: From runs best band to worst, top to bottom, with To breaking the tie. A ribbon in the chart and a row in the table are now found in the same place.",
    ],
    note: "The whole-scenario export is unchanged — still two sheets, the transition summary and every segment behind it. No schema migration.",
  },
  {
    date: "2026-09-03",
    title: "A SQL console on the AI Assistant page",
    pr: 22,
    summary:
      "The AI Assistant now has a SQL toggle: see the query an answer is equivalent to, or write your own against a live schema browser.",
    changes: [
      "The AI never ran SQL to begin with — it fills in a filter (the same kind the Filters page builds), which is evaluated in memory. That was true before this change and still is; it is what keeps the AI from ever reaching a column it shouldn't.",
      "\"View as SQL\" on an answer opens a console showing the query that filter is equivalent to — labeled as an equivalence, not a transcript, since the AI itself never produced or ran it.",
      "\"Write your own\" clears the editor for a real query: a schema tree on the left lists every allowed table and column (read live from the database, so it can't go stale), and clicking one inserts it at the cursor.",
      "Run query executes against the actual database and shows results in a grid below — row count, elapsed time, and a note if a 500-row cap cut anything off.",
      "Available to Administrators only, the same bar as Decision Trees and the map settings, because this reads the database directly rather than through a curated grid.",
    ],
    note: "Read-only in a way enforced by Postgres itself, not just application code: every query runs inside a SET TRANSACTION READ ONLY block with an 8-second timeout, must be a single SELECT/WITH statement, and can only reference an allow-list of tables that excludes users entirely — asking for it, directly or through a join, is rejected before the database ever sees it. This is real protection against a mistaken or malicious query, not against a signed-in Administrator misusing credentials they already hold — that trust boundary is unchanged from before. No schema migration — new server logic and UI only.",
  },
  {
    date: "2026-09-02",
    title: "Export a grid to Excel",
    pr: 21,
    summary:
      "Water Inventory and Inspections each get an Export to Excel button. The file contains what is on screen — same filters, same sort.",
    changes: [
      "A real .xlsx, not a renamed CSV: numbers arrive as numbers and dates as dates, so a column of diameters sorts and sums properly instead of ordering 10 before 8.",
      "The header row is frozen and every column has a filter, because this is a sheet people will sort and slice.",
      "The sheet says what it is and which filters produced it, so an extract is never mistaken for the whole network.",
      "The spreadsheet carries more columns than the grid does — pressure class, joint type, manufacturer and the rest, which you would otherwise look up one segment at a time.",
      "Inspections export every numeric rating as its own column, discovered from the template, so adding a question to the form adds a column here.",
      "Model Results exports two sheets in one file: the transition summary, and every segment behind it — so a figure in the summary can be traced to its rows.",
      "The Filters page exports to Excel as well as CSV, including a filter you have built but not saved.",
    ],
    note: "The export button is disabled when the filters match nothing. Reports keep their existing CSV download.",
  },
  {
    date: "2026-09-02",
    title: "The network on the map now looks like a water system",
    pr: 20,
    summary:
      "Segments were scattered as unconnected lines at random angles over farmland. They now run along streets, joined into one network.",
    changes: [
      "Mains follow a street grid and share junctions, with a heavy backbone through the middle of town and smaller pipe out on the blocks.",
      "The largest diameters sit on the trunk mains, so the map reads the way a system diagram should.",
      "Service areas are contiguous parts of town rather than overlapping circles.",
      "Each segment's recorded length is the length of the run it occupies, so the mileage on the dashboard matches what is drawn.",
    ],
    note: "The data is still invented — no real utility's layout is reproduced. Run npm run db:reshape to re-lay an existing database; it changes geometry only and leaves inspections, wishlist items and users alone.",
  },
  {
    date: "2026-09-02",
    title: "Map filters actually redraw the map, plus wishlist tags and a hover-card setting",
    pr: 19,
    summary:
      "The map was ignoring your filters. That is fixed, the basemap no longer says API KEY REQUIRED across it, and the map and wishlist each gained a setting you asked for.",
    changes: [
      "Network Map has Condition as a standing filter, using your configured bands.",
      "Settings -> General -> Map chooses what the hover card shows, with a live preview built from a real segment. Only ticked fields are fetched, so a shorter card is also a smaller page.",
      "Wishlist items can be tagged with the page they are about, and filtered by it — the dropdown counts open ideas per page so you can see where requests are piling up.",
      "A tag stores the page address rather than its name, so renaming a page keeps every tag pointing at it.",
    ],
    fixes: [
      "Filtering the Network Map changed the count in the heading but not the map. Choosing a filter is a client-side navigation, which re-renders the page without rebuilding the map, and the map only ever read the data it was given on first load. It now redraws and re-frames on what is left.",
      "The basemap was stamped API KEY REQUIRED across every tile. CARTO began requiring a key after this was built; the map now uses OpenStreetMap's own tiles, which need none.",
    ],
    note: "Adds a location column to wishlist_items and a small organization_settings table, so this one needs a migration before deploying.",
  },
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
