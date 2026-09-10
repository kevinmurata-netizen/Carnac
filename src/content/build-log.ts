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
    date: "2026-09-10",
    title: "Export the planning tables to Excel",
    summary:
      "Three tables people work through offline now download as real spreadsheets, and the British spelling of “programme” is gone.",
    changes: [
      "Funded Projects on a scenario exports every funded project across every year, with condition and risk before and after.",
      "Recommended Treatments exports all 218 segments rather than the 25 on screen, including the three terms behind each benefit score so the figure can be checked rather than taken on trust.",
      "Ranked Options exports all 1,364 options with every term of the Priority Score in its own column — including the ones the effectiveness floor rules out, marked as not fundable. They are hidden on screen because they cannot be funded, but someone checking why a cheap option was passed over needs to find it rather than conclude it was never considered.",
      "Real .xlsx, not a CSV with a different extension: costs arrive as currency and scores as numbers, so a column sorts and sums properly instead of ordering 10 before 8.",
      "“Programme” is now “Program” everywhere it appears.",
    ],
    note:
      "No migration. A scenario's stored work plan is named after it — those still read “Funded Programme” until the scenario next runs, when the name is rewritten along with the results.",
  },
  {
    date: "2026-09-10",
    title: "Choose which treatments a scenario is allowed to consider",
    summary:
      "A scenario could only ever be run against the whole library. It can now be narrowed to a handful of treatments, or to one, so you can ask what a relining-only program would actually buy.",
    changes: [
      "Both the New Scenario page and a scenario's own page gain a \"What this scenario considers\" section. Off by default — the whole library stays on the table until you say otherwise.",
      "Turning it on reveals both lists already fully ticked, so narrowing is a matter of unticking rather than starting from an empty screen. Select all and Clear on each list.",
      "A combination can be selected on its own. Its members do not also have to be, so \"this bundle and nothing else\" is a question you can ask.",
      "Untick everything and the page says plainly that the scenario will fund nothing and the budget will go unspent, rather than quietly falling back to the full library.",
      "The scope shows on the scenario for anyone who cannot edit it — a scenario funding nothing but relining looks like a badly performing scenario until you know that is what it was asked to do.",
      "A disabled combination cannot be ticked, and Select all skips it: the run would not include it, so the box would be a promise the model does not keep.",
    ],
    note:
      "Needs one migration. Existing scenarios are unrestricted and stay that way. Restricting Current Funding to relining alone funds 152 relinings, moves final condition from 66.8 to 53.5, and drops the backlog to zero — only the segments relining applies to are candidates at all, and the budget covers them.",
  },
  {
    date: "2026-09-10",
    title: "Two guards on what gets funded: an effectiveness floor and category budget caps",
    summary:
      "Ranking by value for money reliably prefers cheap work, because cheap work really does remove more risk per dollar — it just never renews anything. Two separate guards now stop that becoming a plan that patches forever.",
    changes: [
      "The effectiveness floor is now shared. On a segment below WCI 50, a treatment must cut risk by at least 25% before anything will fund it. That rule already existed inside the per-segment recommendation; the new ranking and the work plan ignored it, so the same system would refuse to recommend a weak patch and then rank it first.",
      "An option below the floor keeps its score and stays visible as an alternative. It simply cannot be picked. On the seed network 333 of 1,364 options fall below it, and the top of the ranking shifts from 20%-effective spot repairs to 28%-effective dig-once bundles.",
      "Category budget caps are new: on each category weighting, set the most of one year's budget that category may take. Work that would breach its cap is passed over and stays in the backlog, still ranked, for a year with room.",
      "Renewal is normally left at 100%. A cap of 100% constrains nothing on its own, but it makes that category the one that absorbs whatever the capped categories leave — which is the point.",
      "Both apply to scenario runs and to generated work plans. Measured over a 10 year run, changing only the caps moved renewal from 54% of spend to 18%.",
      "Set every category below 100% and the editor warns you: nothing is left to absorb the rollover, so any shortfall simply goes unspent.",
    ],
    fixes: [
      "The 25% rule existed in three places with the number written out separately in each. It is one exported function now, so the recommendation, the ranking, the work plan and the scenario simulation cannot drift apart on what counts as effective.",
    ],
    note:
      "Needs one migration. Everything ships inert: the default category weighting caps nothing, so a scenario keeps behaving exactly as it did until someone lowers a cap. Worth knowing what the caps did and did not fix — the scenario simulation was already spending 54% on renewal, because it picks one treatment per segment and had its own effectiveness filter. The runaway patching was in the new ranking, which had not yet shipped.",
  },
  {
    date: "2026-09-10",
    title: "The new Priority Score, and every option ranked by it",
    summary:
      "The ranking formula now reads Criticality × Scale Factor × Category Weight × Expected Benefit ÷ Total Cost, and it is applied to every treatment and every combination on every segment rather than to one pre-chosen option per segment.",
    changes: [
      "Total cost replaces cost per foot. With Scale Factor in the numerator the arithmetic is the same, but the length assumption is now a formula someone chose rather than a step buried in the code.",
      "Scale Factor and Category Weight are read by the ranking for the first time. Both shipped neutral, so switching them on moves nothing until someone changes one.",
      "Treatment Planning gains a Ranked Options card: 1,364 options across 218 segments on the seed network, 191 of them combinations, scored in about two thirds of a second. Every score can be decomposed — hover it to see the five terms that produced it.",
      "A combination is now ranked against the treatments it is made of, on equal footing. Before, only whatever the segment's own recommendation had already picked carried a score, so a bundle that would have won never got the chance to.",
      "The segment's own recommendation is unchanged and still marked. It answers a different question and carries professional overrides — a patch may not headline on a failing main — that no arithmetic ranking should quietly discard.",
      "npm run qa:priority prints what the ranking actually contains: the category mix at the top, where each category first appears, and the median cost, benefit and score per category.",
    ],
    fixes: [
      "Both screens now compute what a treatment achieves through one shared function. They agreed before, but by coincidence rather than construction.",
    ],
    note:
      "No migration. Read the caveat: dividing by total cost hands the top of the ranking to the cheapest work — on the seed network the top 100 options are all repairs, and the first renewal is at rank 543. That is the cost spread showing through, not a finding about the network, and the card says so above the table. The fix is a shared effectiveness floor and is not built yet; docs/TREATMENT-MODEL-REBUILD.md §5.4 records the measurements.",
  },
  {
    date: "2026-09-10",
    title: "Category Weight: say which kinds of work a scenario leans toward",
    summary:
      "Scenario Weights is now two weightings, not one. Benefit Weight says what makes a treatment good; the new Category Weight says which kinds of work you want to do anyway.",
    changes: [
      "Settings › Scenario Weights splits into two cards on one page. The old Weightings section becomes Benefit Weight — the same condition / risk / life-cycle / criticality numbers, unchanged.",
      "Category Weight is new: a multiplier per treatment category — Assess, Repair, Rehabilitate, Renew, Retire. Named and saved the same way, with one default, and chosen from a dropdown on a scenario.",
      "These are multipliers, not shares. 1 leaves a category exactly where its merits put it, 1.5 makes it worth half again as much, 0 takes it off the table entirely. Benefit weights are normalized and these deliberately are not, because 1 has to keep meaning \"leave this alone\".",
      "A category at zero is called out in the editor and in the list — that is an exclusion, not a preference, and it should not be something you discover from an empty plan. A negative weight is refused: it would rank the best option in that category last.",
      "Ships with three category weightings: Even-handed (all ones, the default), Renewal Push, and Buy Time. The default reproduces exactly what the ranking did before, so installing this moves nothing.",
      "A bundle takes the category of its most committing member, so a combination containing a replacement is weighted as renewal — the same rule combinations already use everywhere else.",
    ],
    note:
      "Needs one migration. This is the second of four changes building the new Priority Score: Criticality × Scale Factor × Category Weight × Expected Benefit ÷ Total Cost. Both Scale Factor and Category Weight are now defined and stored, but neither is read by the ranking yet — the third change switches the formula on, and both ship neutral so nothing moves when it does.",
  },
  {
    date: "2026-09-10",
    title: "Scale Factor: say how big a piece of work each asset is",
    summary:
      "How much work an asset represents was assumed to be its length, buried in the ranking code. It is now a formula you write, on its own Settings card, alongside criticality.",
    changes: [
      "Settings › Modeling gains a Scale Factor card. Write a formula over any field on the asset type — LENGTH is the obvious one, but CUSTOMERS_SERVED, a diameter band, or a blend of several are all fair game — save it, and activate the one that should run.",
      "It uses the same editor as Criticality: click a field to insert it, the same if / min / max / clamp / round functions, and the same way of saying what each dropdown value is worth.",
      "Trying a formula out reports the smallest, median and largest factor across the real network, the spread between the extremes, and names the five assets at each end. The spread is the number that matters — a factor spanning 400× reorders the whole plan, one spanning 1.4× barely touches it.",
      "Unlike a criticality score, a scale factor is not squeezed onto 0–100. A segment 1,959 ft long scores 1,959, because it is a multiplier rather than a rating.",
      "An asset missing a field the formula reads falls back to a factor of 1 rather than 0, so a gap in the data never removes it from consideration. The preview counts how many assets that affects and suggests flooring the formula instead.",
    ],
    note:
      "Needs one migration. It ships with 'Segment length' (LENGTH) already active for Waterline, which is exactly what the ranking assumed before — so nothing moves on day one.",
  },
  {
    date: "2026-09-09",
    title: "Scenario runs show their progress, and say when they last ran",
    pr: 48,
    summary:
      "A scenario run gave no sign it was working. It now draws a progress bar against how long the last run actually took, and every scenario records when it was last computed.",
    changes: [
      "Re-run, Save & Re-run and Create & Run Scenario all show a bar while the run is in flight, with an estimate of the time left.",
      "The estimate is measured, not guessed: each successful run records its own duration and the next run is predicted from it. A scenario that has never run borrows the rate other scenarios achieved for comparable work, and says so.",
      "The bar stops short of the end while the estimate holds, because the run is finished when the page reloads rather than when the arithmetic runs out. If it overruns, it stops predicting, turns amber, and reports how long it has actually been waiting.",
      "Scenario Planning gains a Last Run column, and a scenario's own page shows when its results were produced and how long that took. Results are stored rather than recalculated on view, so this is what tells you whether two scenarios were computed against the same treatment library.",
      "Editing a scenario now marks each changed field in amber and counts them — \"2 unsaved changes\" — with a Discard changes button beside Save. Saving re-runs the simulation, so it is worth knowing what you changed before spending a run on it.",
    ],
    fixes: [
      "Making the scenario form track changes moved it to the browser, which broke both scenario pages until a shared helper was moved out of it. Caught by loading the page, not by the type checker.",
    ],
    note: "Needed two migrations. Scenarios that ran before this show a dash rather than a made-up date — the first figure any of them shows will be real.",
  },
  {
    date: "2026-09-09",
    title: "The dashboard map gets its hover card back",
    pr: 47,
    summary:
      "Hovering a segment on the dashboard map showed nothing, while the same map on the Network page showed a full card. Both now read the same setting.",
    changes: [
      "The dashboard map's hover card shows whatever Settings › Map is configured to show — the same fields, in the same order, as the Network page.",
      "On the Treatment Rules page, editing a rule now marks the fields you changed in amber and shows an Unsaved changes badge. A rule's conditions can sit several screens below its name, so knowing something changed is not much use without knowing what.",
    ],
    note: "No migration. The dashboard was asking the database for only the three fields it drew lines with, so the card had nothing to display.",
  },
  {
    date: "2026-09-09",
    title: "The Treatment Library reads the current model",
    pr: 46,
    summary:
      "The library table on Treatment Planning still described treatments using the old condition window and the old single price, both replaced months ago. It now shows the rules and rates that actually decide things.",
    changes: [
      "Condition Range and Materials are replaced by one When it can be used column naming the real rules — \"Condition 40-85 · Material - Cast Iron, Ductile Iron, Steel, Copper\" — plus a count of any blocking rules.",
      "There is deliberately no rule-derived condition range. A treatment gated by a condition rule and a material rule cannot be reduced to a span of numbers, and the old column quietly dropped the material and diameter gates entirely.",
      "Unit cost now comes from the treatment's fallback rate, and says when there are narrower rates behind it.",
      "The library sorts by name rather than by a condition window that no longer decides anything.",
    ],
    note: "No migration. The old columns still hold their data and nothing reads them any more — dropping them is a separate release, so this one can be reverted freely.",
  },
  {
    date: "2026-09-08",
    title: "Life-cycle saving was overstating every treatment",
    pr: 44,
    summary:
      "Doing nothing eventually forces an emergency replacement. The model charged for that replacement but never credited the new pipe it bought, so every treatment compared against it looked better than it was.",
    changes: [
      "A forced replacement now carries the value of the asset it installs, and its unused life at the end of the analysis period is credited back — exactly as a planned replacement's already was.",
      "The credit is based on the planned price rather than the emergency price, because the premium buys speed, not a better pipe.",
    ],
    note: "This moves real numbers. On the worst-condition main in the network, replacing it scored a $70,304 saving and now scores −$21,823, and its Costs tab names Do nothing as the cheapest option. That is the honest arithmetic: deferring a $1.31M job by ten years is worth roughly $440k at a 4% real rate, which the emergency premium and avoided failures do not quite offset. Recommendations themselves did not move, because the engine that picks them does not read life-cycle cost.",
  },
  {
    date: "2026-09-08",
    title: "Every recommendation now shows what it achieves and what the asset is worth",
    pr: 42,
    summary:
      "Treatment Planning gains an Expected Benefit score and a Criticality score for every segment, plus the value the two produce together.",
    changes: [
      "Expected Benefit is a 0–100 score combining condition improvement, risk reduction and life-cycle saving, weighted by the scenario weighting in use. Hover it to see the three figures behind it.",
      "Criticality is shown as its own column — the active formula's score, or the risk-based default where no formula is set.",
      "Both are deliberately separate. Criticality is removed from the benefit score entirely, including from the risk half of it, so that multiplying the two does not count the same thing twice.",
      "Scores are comparable within a run rather than across runs, because each is scaled against every other recommendation in the same run.",
    ],
    fixes: [
      "The benefit score and the value beside it were separated only by a margin, so screen readers and copied text ran them together as \"73.7value 11.03\".",
    ],
    note: "No migration, and nothing is ranked by this yet — it is shown, not applied. Worth looking at before it drives anything: dividing by cost per foot means a $13,500 patch currently outscores a $1.49M replacement twentyfold.",
  },
  {
    date: "2026-09-08",
    title: "Weightings have names, and scenarios are created on their own page",
    pr: 41,
    summary:
      "How much condition, risk and life-cycle cost each count was four numbers typed into the work plan form and stored nowhere. They are now named sets you pick from a list.",
    changes: [
      "New Settings › Scenario Weights card. A weighting has a name and a description — \"Risk First\", not 15/65/10/10 — and the editor shows each weight's share of the ranking as you type.",
      "Three are set up to begin with: Balanced (the weighting every work plan already used), Risk First, and Lowest Life-Cycle Cost. All three are ordinary rows you can edit or delete.",
      "The Generate Work Plan form and the scenario form both choose a weighting from a dropdown instead of asking for four numbers.",
      "A generated work plan now records which weighting produced it, and a copy of the values — so a saved plan can still explain its own ranking after the set is edited.",
      "Deleting a weighting still in use is refused, naming what uses it. The default cannot be deleted at all.",
      "Creating a scenario moved out of the bottom of Scenario Planning onto its own page, reached from Add New Scenario above the comparison grid.",
    ],
    note: "Needed a migration. Your existing weighting is seeded as Balanced, so nothing about how work plans rank changed.",
  },
  {
    date: "2026-09-08",
    title: "Cancel and Discard changes, on every page with a Save button",
    pr: 39,
    summary:
      "Leaving an edit page meant reaching for the sidebar, and a page holding unsaved work looked exactly like one that did not.",
    changes: [
      "Every page with a Save button now has a second button beside it. With nothing changed it is Cancel and goes back to the page named to its left in the breadcrumb; once something is changed it becomes Discard changes.",
      "One control rather than two, because a Cancel and a Discard side by side would leave you working out which one loses your work.",
      "Settings pages that had no notion of unsaved changes at all — role permissions, condition models, risk weights, deterioration curves, configuration, failure types — now show an Unsaved changes marker.",
    ],
    fixes: [
      "A refused save used to empty every field on the form, losing what you typed at exactly the moment the error asked you to fix it.",
      "The failure-type labels bar never noticed edits, because those fields live outside the form they save into.",
    ],
    note: "No migration. Asset and inspection records already worked this way and were left alone.",
  },
  {
    date: "2026-09-07",
    title: "Creating a treatment is its own page",
    pr: 38,
    summary:
      "The Treatments page ended in three empty sections that could only ever offer half of what a treatment needs. Creating one moved to a page of its own.",
    changes: [
      "Add new Treatment sits above the library and opens a page with the same four sections as an existing treatment: Treatment Definition, What it does, What it costs, and When it can be used.",
      "All four are saved together, so a new treatment arrives priced and gated rather than being considered for every inspected asset until someone goes back and finishes it.",
      "Everything is checked before anything is written, and the treatment is removed again if a later step fails — a half-built treatment would quietly change what the model recommends.",
      "Blocking rules are chosen from a searchable dropdown instead of a tick box beside every block ever written.",
      "Adding a rule now says so: the section header, the page and the button all show an Unsaved changes marker, and a section folded shut keeps its marker.",
    ],
    note: "No migration.",
  },
  {
    date: "2026-09-07",
    title: "Arrange the rules that decide when a treatment can be used",
    summary:
      "Rules on a treatment were a flat list with one switch: match all of them, or any of them. They can now be grouped, so \"the right condition, and either the right district or the right pressure zone\" is something you can actually say.",
    changes: [
      "When it can be used is now drawn as a flow chart. Groups hang off a rail, each set to Match all of or Match any of, with rules inside them — so the shape of the logic is visible rather than inferred.",
      "Rules are added from a searchable dropdown instead of a list of every rule with a tick box beside it.",
      "Click any rule in the chart to open the page where it is written.",
      "Blocking rules stay in their own list below, and still apply whatever the arrangement says. A block inside an \"any of\" group has no clear meaning — \"refuse this, or allow that\" does not resolve — so they are kept out of it deliberately.",
      "An empty group lets everything through, matching how an empty group of conditions inside a single rule already behaves. A rule that has been deleted is skipped rather than treated as failed, so removing a rule never silently narrows a treatment.",
    ],
    note: "Needs its migration run before deploying. Every treatment converts to a single group joined the way its old setting said — all becomes Match all, any becomes Match any — which is exactly equivalent, so which assets qualify does not move. That was checked across the whole network before and after.",
  },
  {
    date: "2026-09-07",
    title: "Treatment pages, rearranged",
    summary:
      "Costs get their own card, a treatment's page reads top to bottom in the order you would explain it, and every section folds away.",
    changes: [
      "Treatments and Costs is now two cards: Treatments, and Treatment Costs. The list of every price across the library moved to the new card, where it is grouped by treatment and shows the order each price is tried in.",
      "A treatment's page now runs Treatment Definition, then What it does, then What it costs, then When it can be used. Each section folds away, with a Show all / Hide all button at the top; everything starts open.",
      "Deleting a treatment moved to the bottom of its page, out of the middle of the sections you edit.",
      "On the Treatment Rules page, a long rule now wraps inside its column instead of running into the next one.",
    ],
    note: "No migration, and nothing about the model changed. Prices are still edited on the treatment they belong to; the new card is a second view of the same rates.",
  },
  {
    date: "2026-09-07",
    title: "Deployments are a fraction of the size they were",
    summary:
      "Vercel's function storage filled up because the database library shipped a 21MB program inside every page of the app. It has been replaced with a much smaller one that does the same job.",
    changes: [
      "The database layer went from 47MB to 5.7MB. It was being copied into 53 of the 58 pages that read data, so this is the difference between filling the storage allowance in days and not thinking about it.",
      "Nothing about how the app queries the database changed. Every recommendation, cost, qualification and map draws exactly as before — checked query by query, including the mapping and reporting queries that were most likely to shift.",
    ],
    note: "No migration. Running the app locally now needs one extra container, started the same way as the database: `docker compose up -d`. It translates between the new database driver and the local Postgres, and is not used in production.",
  },
  {
    date: "2026-09-07",
    title: "Groundwork for a much smaller deployment",
    summary:
      "Vercel's function storage filled up. Old deployments were cleared, and three things that were quietly making every deployment larger than it needed to be have been fixed.",
    changes: [
      "The sign-in check that runs on every request no longer loads the database layer. It only ever needed to read the session token, and pulling the whole database client along with it made every request carry code it never used.",
      "The AI assistant and filter builder screens no longer pull the database client into the browser. They only ever needed the list of comparison operators; they were dragging along everything behind it.",
      "The SQL console asks the database for its table and column names in a slightly more explicit way, which is unchanged in what it returns but survives a change of database driver.",
    ],
    note: "Nothing about this is visible on screen, and nothing was verified to have changed: every recommendation, cost and qualification came out identical afterwards. 24 old deployments were also removed, keeping the live one and the one before it for rollback.",
  },
  {
    date: "2026-09-05",
    title: "Treatments you would do together, priced as one job",
    summary:
      "Settings → Treatment Combinations lets you say which treatments you would apply to one segment in one year — relining and cathodic protection, say — so the model can weigh the bundle instead of only the parts.",
    changes: [
      "A combination adds a way of doing the work; it never takes one away. Every treatment in a bundle is still offered on its own exactly as before.",
      "Members qualify under their own rules, so a combination never re-states conditions its treatments already carry. A required member that does not qualify rules the bundle out; an optional one simply stays behind.",
      "A bundle is priced as one job: each treatment's own cost, but mobilization charged once at its largest — one crew, one traffic plan, one bypass. That saving is the reason to bundle at all.",
      "Condition takes the highest reset as a floor and adds any improvements on top; failure probabilities compound; added service life is the longest member's, not the sum, because a liner and anodes do not give fifty years plus fifteen.",
      "In a work plan a bundle appears as one row per treatment, marked as belonging together, with the cost divided between them so the rows still add up.",
      "The page warns when two members both reset condition, which usually means paying for both and counting only the better one.",
    ],
    note: "Needs its migration run before deploying. Nothing changes until you define a combination — with none, the model considers each treatment on its own exactly as it did before. Worth knowing before you define one: a bundle can change what is recommended a great deal, and on our test data it changed 80 of 222 recommendations. It does not currently affect generated work plans at all; the reason is written up in the plan document, and it is the next thing to settle.",
  },
  {
    date: "2026-09-05",
    title: "A treatment can cost different amounts in different places",
    summary:
      "Replacement can now cost $340 a foot in one district and $290 in another, without inventing a second Replacement. A treatment carries a list of prices, each with a rule saying when it applies.",
    changes: [
      "Each treatment's page has a \"What it costs\" section listing its prices. Prices are tried top to bottom and the first whose rule matches is charged, so a narrow price sits above the broad one it carves out of, and the arrows move them.",
      "One price on every treatment has no rule: the fallback, which covers anything the prices above it do not claim. It has to be last, and there has to be exactly one — the page refuses to save otherwise, because a price below the fallback would never be reached and a treatment with no fallback silently stops being offered for the assets its rules miss.",
      "Prices use the same rules as everything else, so \"District - Downtown\" written once can select a price on one treatment and gate a different treatment entirely.",
      "The reasoning behind a recommendation now names which price it used — \"Cost basis: Downtown ($185 per LF plus $30,000 mobilization)\" — whenever it is not the plain fallback.",
      "The Treatments page has a roll-up of every price across the library, so an annual rate review is one screen rather than thirteen.",
      "Mobilization and annual maintenance belong to the price too, not to the treatment, since work priced differently is generally set up and maintained differently.",
    ],
    note: "Needs its migration run before deploying. Every treatment starts with a single price named \"Standard\", holding exactly what it charged before, so nothing costs anything different until you add a second price. That was checked across the whole network: all 1,172 asset-and-treatment pairs came to the same total, to the dollar.",
  },
  {
    date: "2026-09-05",
    title: "Treatment rules are written once and shared",
    summary:
      "A rule is no longer buried inside one treatment. \"Condition 0-45\" is now a single named rule that Replacement and Upsizing both point at, so changing it changes both — and everything that decides when a treatment can be used is finally visible on a page.",
    changes: [
      "Settings → Treatment Rules lists every rule you have, what each one reads as in plain English, and which treatments use it. Edit one there and every treatment using it follows.",
      "The condition window, material list and diameter limits that used to be typed into each treatment have been converted into rules with those names — \"Condition 0-45\", \"Material - Cast Iron, Ductile Iron, Steel, Copper\", \"Diameter at least 6\". Identical ones were merged, so the material rule that three treatments shared is now one rule with three users.",
      "Three rules that were previously buried in the code, invisible and uneditable, are now ordinary rules you can see and change: inspections are skipped on segments already in Excellent condition, abandonment is refused above 25 customers, and emergency repair is only offered where a failure has actually been recorded.",
      "A rule can now allow or block. A block refuses a treatment whatever the other rules say — which is what the three above always meant, and is far safer than asking someone to write the opposite of a condition by hand.",
      "Each treatment's page now has \"When this treatment can be used\": tick the rules that apply, and choose whether an asset must match every rule or any one of them.",
      "Deleting a rule that treatments still depend on is refused, and the message names them.",
    ],
    note: "This one needs its migration run before deploying, as usual. Which assets qualify for which treatments is unchanged — that was checked segment by segment across the whole network, before and after. Adding a treatment with no rules attached now means it is considered for every inspected asset; the Treatments list flags that in red.",
  },
  {
    date: "2026-09-05",
    title: "Rules can test district, and Decision Trees is now Treatment Rules",
    summary:
      "Groundwork for a larger rebuild of how treatments, costs and rules fit together. A rule can now test which district a segment is in, which is what lets a treatment carry a different cost per district later on.",
    changes: [
      "District (service area) and pressure zone joined the fields a rule can test, alongside condition, material, diameter and the rest. Both offer the values your inventory actually holds, so a rule cannot be written against a district that does not exist.",
      "The Decision Trees card is now called Treatment Rules, and the page says rule wherever it used to say tree. Nothing moved and nothing was renamed in your data — the rules you have already written are untouched.",
      "The sample segments used to test a rule now show which district they are in.",
    ],
    fixes: [
      "Scenario runs were ignoring any rule written against criticality — the simulation never supplied that value, so such a rule quietly matched nothing. It now supplies it, so scenarios and work plans agree about which treatments are allowed.",
    ],
    note: "No schema migration. If you have a rule that tests criticality, the next scenario run may fund different work than the last one did — that is the fix above taking effect.",
  },
  {
    date: "2026-09-04",
    title: "Sign in the way browsers expect, so the password prompt appears",
    pr: 27,
    summary:
      "The previous attempt at this did not go far enough — the browser still never offered to save the password. Signing in is now a real form submission rather than a background request.",
    changes: [
      "The sign-in form posts directly to the authentication endpoint and the browser follows the redirect, which is the flow password managers were built to recognise. Before, the sign-in happened as a background request and the page moved itself afterwards, which a browser has to infer rather than observe.",
      "A wrong password comes back on the page as before, and being sent to sign in from somewhere else still returns you to where you were going.",
    ],
    note: "If your browser still does not ask, check its list of sites it was told never to save for — once dismissed with \"Never\", it will not ask again no matter what this page does. In Chrome that is under Password Manager, Settings, Declined sites. No schema migration.",
  },
  {
    date: "2026-09-04",
    title: "Stop retyping your email and password at sign-in",
    pr: 26,
    summary:
      "The sign-in page now remembers your email if you ask it to, and your browser will finally offer to save your password.",
    changes: [
      "A \"Remember my email on this device\" tick box. Your email comes back next time; unticking it forgets the address immediately.",
      "Your password is never stored by this application. Remembering it is the browser's password manager's job, which can encrypt it against your device's keychain and put a fingerprint or PIN in front of it — none of which anything this app saved could do.",
    ],
    fixes: [
      "The browser never offered to save your password, which is the actual reason you were typing it every time. Two causes: the email field was labelled as a contact address rather than as an account name, so password managers did not recognise the pair; and signing in navigated within the page rather than properly, which is the moment a browser decides whether to ask. Both fixed.",
    ],
    note: "Sessions already last 30 days and always did — you were not being signed out, only asked to type the password again because the browser had never been given the chance to remember it. No schema migration.",
  },
  {
    date: "2026-09-04",
    title: "Write your own criticality formula",
    pr: 25,
    summary:
      "Settings → Modeling → Criticality is a new screen for defining how much an asset matters, using that asset type's own fields and basic maths. Criticality is what ranks which projects a work plan funds first.",
    changes: [
      "Write a formula like clamp((CUSTOMERS_SERVED / 20) + CRITICALITY * 8, 0, 100). Click any field on the left to drop it in; brackets, + − × ÷ and min, max, clamp and round are all available.",
      "Conditions too: if(LENGTH > 20, 5, 10) gives one value when a test passes and another when it does not, and they nest, so a formula can step an asset through tiers rather than only scaling it smoothly.",
      "Tests compare with > < >= <= = and !=, and join with and / or — if(DIAMETER > 12 and CUSTOMERS_SERVED > 200, 90, 20). A comparison is worth 1 or 0 on its own, so (DIAMETER > 12) * 15 works as a way of adding a bonus.",
      "Dropdowns can be used too. Say what each value is worth — Institutional 6, Residential 1 — and only the dropdowns your formula actually mentions ask to be filled in.",
      "Try it on every asset before saving. You get the spread of scores, which segments would rank first and last, and a warning if any asset is missing a value the formula reads, which is how you catch a dropdown value nobody gave a number to.",
      "Formulas are per asset type, so pipes and pumps can be scored on entirely different things. Several can exist side by side and one is active — an alternative can be written and tried out without disturbing the one in use.",
      "Every score records which formula produced it and what went in, so a number on an asset can always be explained.",
      "Run the model now, on both the Criticality and Risk Models screens. Saved weights and formulas have always said they apply \"the next time the model runs\" — but nothing in the application ever ran it, so until now neither took effect outside a reseed.",
      "A scenario can name the criticality formula that ranks its work plans, so two scenarios can be compared on what they treat as important — one that funds hospitals first against one that funds the oldest pipe first — from the same budget and the same network.",
    ],
    fixes: [
      "Risk weights and criticality formulas were both inert. Saving either one said it would apply on the next model run, and there was no way to run the model — the recompute existed but was only ever called by the database seed.",
    ],
    note: "Needs a migration before deploying — it adds a criticality_models table and a column on scenarios. Nothing changes until a formula is made active: an asset type without one keeps the previous behaviour, where criticality is a rescale of the risk model's consequence-of-failure rating. A scenario's own formula ranks its work plans straight away; the stored score that asset pages show changes when the model runs.",
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
