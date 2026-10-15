"use client";

import Link from "next/link";
import { useAssetWords } from "@/components/layout/asset-words";
import { Label } from "@/components/ui/label";
import { useIndexWords } from "@/components/layout/index-words";
import { AFTER_TARGET, AFTER_TARGET_LABELS, ASSET_TYPE_WEIGHT_RANGE, STRATEGIES } from "@/domain/waterline/scenario";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * What the form holds while it is being edited.
 *
 * Numbers are strings so an emptied box stays empty rather than snapping back
 * to zero under the cursor, and so a half-typed value is never silently
 * reinterpreted. They are parsed once, on the server, by the same schema that
 * always validated them.
 */
export type ScenarioValues = {
  name: string;
  description: string;
  annualBudget: string;
  fundingGrowthPct: string;
  discountRatePct: string;
  analysisPeriodYears: string;
  conditionTarget: string;
  riskThreshold: string;
  strategy: string;
  criticalityModelId: string;
  weightSetId: string;
  categoryWeightSetId: string;
  categoryFundingPlanId: string;
  leadTimeSetId: string;
  budgetPlanId: string;
  /** "pooled" or "separate": how a scenario over several types spends a
   * budget that sets money per type. */
  typeFunding: string;
  /** "on" when the scenario bundles neighbouring work. */
  corridorBundling: string;
  /** "on" when, bundling, work may also wait for a neighbour's bundle. */
  corridorDeferral: string;
  savedFilterId: string;
  /** The modelled asset types it is narrowed to, sorted and comma-joined so it
   * compares like every other field. Empty is all of them. */
  assetTypeIds: string;
  /** Each asset type's weight as typed, "id=weight" pairs sorted and
   * comma-joined. A type with no pair has a weight of 1. */
  assetTypeWeights: string;
  scenarioSetId: string;
  fundingMode: string;
  /** "on" when a budget scenario shows a condition target; a target run
   * always has one. */
  hasConditionTarget: string;
  targetInYears: string;
  afterTarget: string;
  lockedWorkPlanId: string;
  programmedFunding: string;
};

export type ScenarioFieldDefaults = {
  name: string;
  description: string;
  annualBudget: number;
  fundingGrowthPct: number;
  discountRatePct: number;
  analysisPeriodYears: number;
  /** Null is a budget scenario with no target. */
  conditionTarget: number | null;
  riskThreshold: number;
  strategy: string;
  criticalityModelId: string | null;
  weightSetId: string | null;
  categoryWeightSetId: string | null;
  categoryFundingPlanId: string | null;
  leadTimeSetId: string | null;
  budgetPlanId?: string | null;
  typeFunding?: string;
  corridorBundling?: boolean;
  corridorDeferral?: boolean;
  savedFilterId: string | null;
  /** Empty, or absent, is every modelled asset type. */
  assetTypeIds?: string[];
  /** Absent, or a type left out, is a weight of 1. */
  assetTypeWeights?: Record<string, number>;
  scenarioSetId: string | null;
  fundingMode: string;
  targetInYears: number;
  afterTarget: string;
  lockedWorkPlanId: string | null;
  programmedFunding: string;
};

export function toValues(d: ScenarioFieldDefaults): ScenarioValues {
  return {
    name: d.name,
    description: d.description,
    annualBudget: String(d.annualBudget),
    fundingGrowthPct: String(d.fundingGrowthPct),
    discountRatePct: String(d.discountRatePct),
    analysisPeriodYears: String(d.analysisPeriodYears),
    // With no target the box keeps the default, so ticking it back on offers
    // a sensible number rather than an empty field.
    conditionTarget: String(d.conditionTarget ?? 70),
    riskThreshold: String(d.riskThreshold),
    strategy: d.strategy,
    criticalityModelId: d.criticalityModelId ?? "",
    weightSetId: d.weightSetId ?? "",
    categoryWeightSetId: d.categoryWeightSetId ?? "",
    categoryFundingPlanId: d.categoryFundingPlanId ?? "",
    leadTimeSetId: d.leadTimeSetId ?? "",
    budgetPlanId: d.budgetPlanId ?? "",
    typeFunding: d.typeFunding ?? "pooled",
    corridorBundling: d.corridorBundling ? "on" : "",
    corridorDeferral: d.corridorDeferral ? "on" : "",
    savedFilterId: d.savedFilterId ?? "",
    assetTypeIds: [...(d.assetTypeIds ?? [])].sort().join(","),
    assetTypeWeights: joinWeights(
      Object.fromEntries(Object.entries(d.assetTypeWeights ?? {}).map(([id, w]) => [id, String(w)]))
    ),
    scenarioSetId: d.scenarioSetId ?? "",
    fundingMode: d.fundingMode,
    hasConditionTarget: d.conditionTarget != null ? "on" : "",
    targetInYears: String(d.targetInYears),
    afterTarget: d.afterTarget,
    lockedWorkPlanId: d.lockedWorkPlanId ?? "",
    programmedFunding: d.programmedFunding,
  };
}

/** The sets a scenario can join. The window travels with the choice so the
 * form can show what joining would do to the analysis period before saving. */
export type ScenarioSetChoice = {
  id: string;
  name: string;
  baseYear: number;
  planningPeriodYears: number;
  statusLabel: string;
};

/** The formulas that can rank this scenario's work plans. */
export type CriticalityChoice = { id: string; name: string; assetTypeName: string; isActive: boolean };

/** The named weightings this scenario can rank by. */
export type WeightSetChoice = { id: string; name: string; isDefault: boolean; summary: string };

/** The named category weightings this scenario can lean by. `excluded` names
 * the categories a set switches off entirely, which is worth saying in the
 * dropdown rather than leaving to be discovered from an empty plan. */
export type CategoryWeightSetChoice = {
  id: string;
  name: string;
  isDefault: boolean;
  summary: string;
  excluded: string[];
};

/** The named funding plans this scenario can spend by. `summary` is the order
 * itself, because the order is the thing being chosen. */
export type FundingPlanChoice = { id: string; name: string; isDefault: boolean; summary: string };

/** How long this scenario's work takes to be paid for and built. `summary`
 * names only the categories that wait, since that is what distinguishes one
 * set from another. */
export type LeadTimeChoice = { id: string; name: string; isDefault: boolean; summary: string };

/** The budget plans this scenario can follow. `summary` is the years each
 * covers. */
export type BudgetPlanChoice = { id: string; name: string; summary: string };

/** The saved filters a scenario can be limited to. `criteriaCount` is shown
 * because a filter with no criteria matches everything, which is worth knowing
 * before choosing it as a limit. */
export type FilterChoice = { id: string; name: string; criteriaCount: number };

/** The modelled asset types a scenario can be narrowed to. */
export type AssetTypeChoice = {
  id: string;
  name: string;
  /** What the type's work typically scored in the first year of the last
   * run, before its weight. Absent before a run, or on a single-type run. */
  typicalPriority?: number | null;
};

const formatScore = (n: number) => String(Number(n.toPrecision(4)));

/** A weight, to two significant figures and inside the allowed range. */
function roundWeight(w: number): number {
  const { min, max } = ASSET_TYPE_WEIGHT_RANGE;
  const clamped = Math.min(max, Math.max(min, w));
  return Number(clamped.toPrecision(2));
}

/** The work plans whose projects a scenario can lock. Never a scenario run's
 * own programme, which changes every time that scenario runs. */
export type LockedPlanChoice = { id: string; name: string; startYear: number; endYear: number; projectCount: number };

/**
 * The scenario parameter inputs, shared by the create and edit forms so the two
 * cannot drift apart. `idPrefix` keeps label/input ids unique when both forms
 * are ever on one page.
 *
 * Controlled rather than uncontrolled, for two reasons that turned out to be
 * the same reason: React clears an uncontrolled form once its action returns,
 * which would throw away an edit the moment a save was refused, and per-field
 * change marks are impossible without holding the values anyway.
 *
 * Pass `saved` to get those marks. A field whose value differs from what is
 * stored is ringed amber — a scenario has eleven inputs across two screens of
 * page, so "something changed" is not much use without "which".
 */
export function ScenarioFields({
  values,
  onChange,
  saved,
  idPrefix = "",
  criticalityChoices = [],
  weightSetChoices = [],
  categoryWeightSetChoices = [],
  fundingPlanChoices = [],
  leadTimeChoices = [],
  budgetPlanChoices = [],
  filterChoices = [],
  assetTypeChoices = [],
  lockedPlanChoices = [],
  scenarioSetChoices = [],
  lockSet = false,
}: {
  values: ScenarioValues;
  onChange: (patch: Partial<ScenarioValues>) => void;
  /** Omitted when creating, where there is nothing to have changed from. */
  saved?: ScenarioValues;
  idPrefix?: string;
  criticalityChoices?: CriticalityChoice[];
  weightSetChoices?: WeightSetChoice[];
  categoryWeightSetChoices?: CategoryWeightSetChoice[];
  fundingPlanChoices?: FundingPlanChoice[];
  leadTimeChoices?: LeadTimeChoice[];
  budgetPlanChoices?: BudgetPlanChoice[];
  filterChoices?: FilterChoice[];
  /** Offered only when more than one asset type is modelled. */
  assetTypeChoices?: AssetTypeChoice[];
  lockedPlanChoices?: LockedPlanChoice[];
  scenarioSetChoices?: ScenarioSetChoice[];
  /** Show the chosen set as fixed rather than as a choice. */
  lockSet?: boolean;
}) {
  const words = useAssetWords();
  const id = (name: string) => `${idPrefix}${name}`;
  const index = useIndexWords();
  const mark = (key: keyof ScenarioValues) =>
    saved && values[key] !== saved[key] ? `${input} border-amber-500` : input;
  // Read from the selection rather than from what is stored, so choosing a set
  // shows its window straight away instead of after the save that commits it.
  const governingSet = scenarioSetChoices.find((s) => s.id === values.scenarioSetId) ?? null;
  const targeting = values.fundingMode === "target";
  // How many asset types the run covers: every modelled type when none is
  // ticked off.
  const coversTypes = values.assetTypeIds ? values.assetTypeIds.split(",").length : assetTypeChoices.length;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={id("name")}>Scenario Name</Label>
        <input
          id={id("name")}
          name="name"
          required
          placeholder="e.g. Preventive Strategy"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className={mark("name")}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={id("description")}>Description</Label>
        <input
          id={id("description")}
          name="description"
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className={mark("description")}
        />
      </div>

      {/* Near the top, because it changes a field further down: a set decides
          the years, and the analysis period below defers to it. */}
      {lockSet && governingSet ? (
        // Creating inside a set: the set was chosen by arriving from its page,
        // so it is stated rather than offered again.
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <input type="hidden" name="scenarioSetId" value={governingSet.id} />
          <div className="text-sm font-medium">Scenario set</div>
          <p className="text-sm">
            <span className="font-medium">{governingSet.name}</span>{" "}
            <span className="text-muted-foreground tabular-nums">
              — runs {governingSet.baseYear}–{governingSet.baseYear + governingSet.planningPeriodYears - 1}
            </span>
          </p>
        </div>
      ) : (
        scenarioSetChoices.length > 0 && (
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor={id("scenarioSetId")}>Scenario set</Label>
            <select
              id={id("scenarioSetId")}
              name="scenarioSetId"
              value={values.scenarioSetId}
              onChange={(e) => onChange({ scenarioSetId: e.target.value })}
              className={mark("scenarioSetId")}
            >
              {/* Offered only to a scenario that has never been in a set —
                  one made before sets existed. Once in a set, a scenario can
                  move between sets but not leave. */}
              {!saved?.scenarioSetId && <option value="">Not in a set — starts in the year it is run</option>}
              {scenarioSetChoices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.baseYear}–{s.baseYear + s.planningPeriodYears - 1} · {s.statusLabel}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Scenarios in a set all run from the set&apos;s base year for its planning period, so they can be compared
              year for year. Choosing another set moves this scenario there.
            </p>
          </div>
        )
      )}
      {/* Above the numbers because it decides what they are about: every
          average a run reports, and the condition target it is measured
          against, covers the assets this names and no others. */}
      {filterChoices.length > 0 && (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor={id("savedFilterId")}>Assets</Label>
          <select
            id={id("savedFilterId")}
            name="savedFilterId"
            value={values.savedFilterId}
            onChange={(e) => onChange({ savedFilterId: e.target.value })}
            className={mark("savedFilterId")}
          >
            <option value="">The whole network</option>
            {filterChoices.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.criteriaCount === 0 ? " — no criteria, so still the whole network" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Run this scenario over the assets a saved filter matches, rather than the whole network. Its average
            condition, its backlog and the condition target below are then that group&apos;s rather than the
            network&apos;s. Filters are built under Settings &rsaquo; Filters.
          </p>
        </div>
      )}

      {/* Beside the filter, because it narrows the same thing: which assets
          the run is about. Only once there is more than one type to choose. */}
      {assetTypeChoices.length > 1 && (
        <AssetTypeField
          choices={assetTypeChoices}
          value={values.assetTypeIds}
          changed={!!saved && values.assetTypeIds !== saved.assetTypeIds}
          onChange={(assetTypeIds) => onChange({ assetTypeIds })}
          weights={values.assetTypeWeights}
          weightsChanged={!!saved && values.assetTypeWeights !== saved.assetTypeWeights}
          onWeightsChange={(assetTypeWeights) => onChange({ assetTypeWeights })}
        />
      )}

      {/* Work already committed, which the run takes as given rather than
          deciding. Beside the assets because it, too, decides what the run is
          about: those assets' futures through their build years are settled. */}
      {lockedPlanChoices.length > 0 && (
        <>
          <div className={`space-y-1.5 ${values.lockedWorkPlanId ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-4"}`}>
            <Label htmlFor={id("lockedWorkPlanId")}>Lock projects from</Label>
            <select
              id={id("lockedWorkPlanId")}
              name="lockedWorkPlanId"
              value={values.lockedWorkPlanId}
              onChange={(e) => onChange({ lockedWorkPlanId: e.target.value })}
              className={mark("lockedWorkPlanId")}
            >
              <option value="">No work plan — the run decides every project</option>
              {lockedPlanChoices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.startYear}–{p.endYear} · {p.projectCount} project{p.projectCount === 1 ? "" : "s"}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Its projects run as programmed: each one&apos;s money is spent in its year and its treatment applied in its
              build year, and the run does no work on that asset from the year it was programmed until it is built.
              Cancelled and deferred projects are left out.
            </p>
          </div>
          {values.lockedWorkPlanId && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={id("programmedFunding")}>Programmed work is</Label>
              <select
                id={id("programmedFunding")}
                name="programmedFunding"
                value={values.programmedFunding}
                onChange={(e) => onChange({ programmedFunding: e.target.value })}
                className={mark("programmedFunding")}
              >
                <option value="within">Paid from the annual budget — the run spends what is left</option>
                <option value="additional">Funded on top — the run keeps the whole annual budget</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Either way the results show programmed work apart from what the annual allocation bought.
              </p>
            </div>
          )}
        </>
      )}
      {lockedPlanChoices.length === 0 && <input type="hidden" name="programmedFunding" value={values.programmedFunding} />}

      {/* What holds the scenario back. Above the budget because it decides
          whether the budget is an input at all. */}
      <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
        <Label htmlFor={id("fundingMode")}>Constrained by</Label>
        <select
          id={id("fundingMode")}
          name="fundingMode"
          value={values.fundingMode}
          onChange={(e) => onChange({ fundingMode: e.target.value })}
          className={mark("fundingMode")}
        >
          <option value="budget">A budget — spend this much a year, see where the network gets to</option>
          <option value="target">A target — reach this condition by this year, see what it costs a year</option>
        </select>
        <p className="text-xs text-muted-foreground">
          {targeting
            ? "The run searches for the flat annual amount that reaches the target in the year given, then does what After the target year says for the rest of the period. It never breaks a treatment rule to get there, so a target the rules cannot reach is reported as unreachable rather than forced."
            : "The ordinary run: the year's money buys the best work it can, and where the network ends up is the answer."}
        </p>
      </div>

      {targeting ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={id("conditionTarget")}>Condition Target ({index.short})</Label>
            <input
              id={id("conditionTarget")}
              name="conditionTarget"
              type="number"
              min={0}
              max={100}
              required
              value={values.conditionTarget}
              onChange={(e) => onChange({ conditionTarget: e.target.value })}
              className={mark("conditionTarget")}
            />
            <p className="text-xs text-muted-foreground">
              The average across this scenario&apos;s assets that the run has to reach — and the bar the treatment
              rules judge work against.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("targetInYears")}>Reach it within (yr)</Label>
            <input
              id={id("targetInYears")}
              name="targetInYears"
              type="number"
              min={1}
              max={Number(values.analysisPeriodYears) || 50}
              value={values.targetInYears}
              onChange={(e) => onChange({ targetInYears: e.target.value })}
              className={mark("targetInYears")}
            />
            <p className="text-xs text-muted-foreground">
              Counted from the first year of the run. 1 means by the end of year one.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Annual Budget ($)</Label>
            {/* Still posted, so switching back to a budget gives back the
                number that was there rather than zero. */}
            <input type="hidden" name="annualBudget" value={values.annualBudget} />
            <input type="hidden" name="fundingGrowthPct" value={values.fundingGrowthPct} />
            <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
              Solved by the run
            </div>
            <p className="text-xs text-muted-foreground">
              The amount is the answer here rather than the question, so it is not typed. Funding growth does not
              apply either: what is being solved for is one flat figure a year.
            </p>
          </div>
          {/* Doing nothing afterwards is how a run finds just the programme
              that reaches the target — a work plan made from it holds those
              years' projects and nothing else — while the years after still
              show what happens if nothing follows it. */}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor={id("afterTarget")}>After the target year</Label>
            <select
              id={id("afterTarget")}
              name="afterTarget"
              value={values.afterTarget}
              onChange={(e) => onChange({ afterTarget: e.target.value })}
              className={mark("afterTarget")}
            >
              {AFTER_TARGET.map((v) => (
                <option key={v} value={v}>
                  {AFTER_TARGET_LABELS[v]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {values.afterTarget === "none"
                ? "No new work is decided after the target year, and the network deteriorates for the rest of the period. With delivery lead times, work decided by the target year is still paid for and built. A work plan made from this scenario holds only the work that reaches the target."
                : "The run keeps the network at the target for the rest of the period, buying only what that takes. With delivery lead times it decides work for the year it will be built in — just enough to keep that year at the target — and pays for it in the years the lead times say."}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={id("annualBudget")}>Annual Budget ($)</Label>
            <input
              id={id("annualBudget")}
              name="annualBudget"
              type="number"
              min={0}
              step={100000}
              value={values.annualBudget}
              onChange={(e) => onChange({ annualBudget: e.target.value })}
              className={mark("annualBudget")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("fundingGrowthPct")}>Funding Growth (%/yr)</Label>
            <input
              id={id("fundingGrowthPct")}
              name="fundingGrowthPct"
              type="number"
              step={0.5}
              value={values.fundingGrowthPct}
              onChange={(e) => onChange({ fundingGrowthPct: e.target.value })}
              className={mark("fundingGrowthPct")}
            />
          </div>
          {/* One target field in both modes. Here it is optional, and only a
              reference: moving it moves a line, never the money. */}
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={id("conditionTarget")}>Condition Target ({index.short})</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  name="hasConditionTarget"
                  checked={values.hasConditionTarget === "on"}
                  onChange={(e) => onChange({ hasConditionTarget: e.target.checked ? "on" : "" })}
                  className="h-3.5 w-3.5"
                />
                Show a condition target
              </label>
            </div>
            <input
              id={id("conditionTarget")}
              name="conditionTarget"
              type="number"
              min={0}
              max={100}
              disabled={values.hasConditionTarget !== "on"}
              value={values.hasConditionTarget === "on" ? values.conditionTarget : ""}
              placeholder="No target"
              onChange={(e) => onChange({ conditionTarget: e.target.value })}
              className={`${mark("conditionTarget")} disabled:cursor-not-allowed disabled:bg-muted`}
            />
            <p className="text-xs text-muted-foreground">
              A line on the condition chart and the Below Target count, if you want one. It does not change what the
              budget buys — in a budget run the treatment rules judge work against 70, the start of the Good band.
            </p>
          </div>
          {/* Held so target mode keeps them across a switch. */}
          <input type="hidden" name="targetInYears" value={values.targetInYears} />
          <input type="hidden" name="afterTarget" value={values.afterTarget} />
        </>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={id("discountRatePct")}>Discount Rate (%)</Label>
        <input
          id={id("discountRatePct")}
          name="discountRatePct"
          type="number"
          step={0.25}
          value={values.discountRatePct}
          onChange={(e) => onChange({ discountRatePct: e.target.value })}
          className={mark("discountRatePct")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("analysisPeriodYears")}>Analysis Period (yr)</Label>
        {governingSet ? (
          <>
            {/* The set's period is shown, the scenario's own is what posts.
                Leaving the set then gives back what the scenario had, rather
                than the set's number having quietly replaced it. */}
            <input type="hidden" name="analysisPeriodYears" value={values.analysisPeriodYears} />
            <input
              id={id("analysisPeriodYears")}
              type="number"
              readOnly
              aria-describedby={id("analysisPeriodYears-note")}
              value={governingSet.planningPeriodYears}
              className={`${input} cursor-not-allowed bg-muted text-muted-foreground`}
            />
            <p id={id("analysisPeriodYears-note")} className="text-xs text-muted-foreground">
              Set by {governingSet.name}: {governingSet.baseYear}–
              {governingSet.baseYear + governingSet.planningPeriodYears - 1}
            </p>
          </>
        ) : (
          <input
            id={id("analysisPeriodYears")}
            name="analysisPeriodYears"
            type="number"
            min={1}
            max={50}
            value={values.analysisPeriodYears}
            onChange={(e) => onChange({ analysisPeriodYears: e.target.value })}
            className={mark("analysisPeriodYears")}
          />
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("riskThreshold")}>Risk Threshold (1–25)</Label>
        <input
          id={id("riskThreshold")}
          name="riskThreshold"
          type="number"
          min={0}
          max={25}
          step={0.5}
          value={values.riskThreshold}
          onChange={(e) => onChange({ riskThreshold: e.target.value })}
          className={mark("riskThreshold")}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={id("strategy")}>Prioritization Strategy</Label>
        <select
          id={id("strategy")}
          name="strategy"
          value={values.strategy}
          onChange={(e) => onChange({ strategy: e.target.value })}
          className={mark("strategy")}
        >
          {STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Chosen from the named sets rather than typed here. A weighting is a
          policy that outlives one scenario, and four numbers in this form
          could not be compared with four numbers in another. */}
      {weightSetChoices.length > 0 && (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor={id("weightSetId")}>Scenario weighting</Label>
          <select
            id={id("weightSetId")}
            name="weightSetId"
            value={values.weightSetId}
            onChange={(e) => onChange({ weightSetId: e.target.value })}
            className={mark("weightSetId")}
          >
            <option value="">The organization&apos;s default weighting</option>
            {weightSetChoices.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.isDefault ? " (default)" : ""} — {w.summary}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            How much condition, risk and life-cycle cost each count when this scenario&apos;s work is ranked. Edit the
            sets themselves under Settings › Scenario Weights.
          </p>
        </div>
      )}

      {/* Sits directly under the benefit weighting because the two are read
          together: one says what makes a treatment good, the other says which
          kinds of work this scenario wants anyway. */}
      {categoryWeightSetChoices.length > 0 && (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor={id("categoryWeightSetId")}>Category weighting</Label>
          <select
            id={id("categoryWeightSetId")}
            name="categoryWeightSetId"
            value={values.categoryWeightSetId}
            onChange={(e) => onChange({ categoryWeightSetId: e.target.value })}
            className={mark("categoryWeightSetId")}
          >
            <option value="">The organization&apos;s default category weighting</option>
            {categoryWeightSetChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isDefault ? " (default)" : ""} — {c.summary}
                {c.excluded.length > 0 ? ` — no ${c.excluded.join(", ")}` : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            How far this scenario leans toward one kind of work — repair over renewal, or the other way about. A
            multiplier on the Priority Score, so leaving every category at 1 ranks purely on the merits. Edit the sets
            under Settings &rsaquo; Scenario Weights.
          </p>
        </div>
      )}

      {/* The money itself, year by year, where the utility has it set out
          rather than as one figure and a growth rate. A target run solves for
          its money, so it has nothing to follow. */}
      {!targeting && (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor={id("budgetPlanId")}>Budget</Label>
          <select
            id={id("budgetPlanId")}
            name="budgetPlanId"
            value={values.budgetPlanId}
            onChange={(e) => onChange({ budgetPlanId: e.target.value })}
            className={mark("budgetPlanId")}
          >
            <option value="">The annual budget and growth above</option>
            {budgetPlanChoices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.summary}
              </option>
            ))}
          </select>
          {values.budgetPlanId && coversTypes > 1 && (
            <select
              id={id("typeFunding")}
              name="typeFunding"
              aria-label="How the asset types share the budget"
              value={values.typeFunding}
              onChange={(e) => onChange({ typeFunding: e.target.value })}
              className={mark("typeFunding")}
            >
              <option value="pooled">Pooled — the asset types share each year&apos;s money</option>
              <option value="separate">Separate — each asset type spends only its own money in the budget</option>
            </select>
          )}
          <p className="text-xs text-muted-foreground">
            {values.budgetPlanId && coversTypes > 1 && values.typeFunding === "separate"
              ? "Each asset type is held to its own amount for each year the budget sets one, and to any category amounts within it — money one type leaves unspent is not used by another. A type the budget sets nothing for that year is held only by the year's total. "
              : ""}
            {values.budgetPlanId
              ? "Each year the budget lists uses its amount instead of the annual budget and growth, and any category amounts it sets are the most that category may take that year. Years it does not list still use the annual budget and growth above."
              : "Follow a budget set year by year in dollars — the money you actually expect to have, with amounts per category if you break it out that way."}{" "}
            <Link href="/scenario-planning/budgets" className="font-medium text-primary underline-offset-2 hover:underline">
              {budgetPlanChoices.length > 0 ? "Edit budgets" : "Set up a budget"}
            </Link>
          </p>
        </div>
      )}

      {/* Where the work is, beside what it costs: neighbouring work done
          together for what that saves. A target run solves for its money,
          and bundling is not yet part of that. */}
      {!targeting && (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <label
            className={`flex w-fit items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
              saved && values.corridorBundling !== saved.corridorBundling ? "border-amber-500" : "border-transparent"
            }`}
          >
            <input
              type="checkbox"
              name="corridorBundling"
              checked={values.corridorBundling === "on"}
              onChange={(e) => onChange({ corridorBundling: e.target.checked ? "on" : "" })}
            />
            Bundle neighbouring work (corridor bundling)
          </label>
          <p className="text-xs text-muted-foreground">
            Once the year&apos;s work is chosen, work on {words.items} beside it is offered again at its bundled price —
            what doing it together saves comes off — and joins if the money left is worth spending on it. Which{" "}
            {words.items} are neighbours, and what each pair of asset types saves, are set under{" "}
            <Link href="/settings/corridor-bundling" className="font-medium text-primary underline-offset-2 hover:underline">
              Settings &rsaquo; Corridor Bundling
            </Link>
            ; a pair with no saving set never bundles. Within the timing window set there, work not due yet can be
            brought forward to join — judged by what it does now, so it joins only if it is still worth its price.
          </p>
          {values.corridorBundling === "on" && (
            <label
              className={`ml-6 flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                saved && values.corridorDeferral !== saved.corridorDeferral ? "border-amber-500" : "border-transparent"
              }`}
            >
              <input
                type="checkbox"
                name="corridorDeferral"
                checked={values.corridorDeferral === "on"}
                onChange={(e) => onChange({ corridorDeferral: e.target.checked ? "on" : "" })}
              />
              Also let work wait for a neighbour&apos;s bundle
            </label>
          )}
          {values.corridorBundling === "on" && values.corridorDeferral === "on" && (
            <p className="ml-6 text-xs text-muted-foreground">
              Work that isn&apos;t high-risk can be held back, once, for up to the timing window when a neighbour&apos;s
              work will come due and couldn&apos;t be brought forward now — but only where the bundle is expected to
              save more than waiting is expected to cost in failures. It is released early if it becomes too risky to
              wait.
            </p>
          )}
        </div>
      )}

      {/* Separate from the category weighting directly above it, and the copy
          has to work to keep them apart: one changes what ranks first, the
          other what the money buys. */}
      {fundingPlanChoices.length > 0 && (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor={id("categoryFundingPlanId")}>Category funding</Label>
          <select
            id={id("categoryFundingPlanId")}
            name="categoryFundingPlanId"
            value={values.categoryFundingPlanId}
            onChange={(e) => onChange({ categoryFundingPlanId: e.target.value })}
            className={mark("categoryFundingPlanId")}
          >
            <option value="">No category limits — only the yearly budget</option>
            {fundingPlanChoices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? " (default)" : ""} — {p.summary}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            The most of each year each kind of work may take. Unlike the weighting above, this does not change
            what scores highest — it limits what the money buys. Edit the plans under
            Settings &rsaquo; Category Funding.
          </p>
        </div>
      )}

      {/* How long the work takes to arrive, which is a different question from
          how much of it there is: these decide when money leaves and when the
          network improves, not what is worth doing. */}
      {leadTimeChoices.length > 0 && (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor={id("leadTimeSetId")}>Delivery lead times</Label>
          <select
            id={id("leadTimeSetId")}
            name="leadTimeSetId"
            value={values.leadTimeSetId}
            onChange={(e) => onChange({ leadTimeSetId: e.target.value })}
            className={mark("leadTimeSetId")}
          >
            {/* Naming the default rather than describing what no set would
                mean: leaving this empty follows the organization's default,
                which is only "everything in the year it is decided" when
                there is no default to follow. */}
            <option value="">
              {leadTimeChoices.find((l) => l.isDefault)
                ? `The organization's default — ${leadTimeChoices.find((l) => l.isDefault)!.name}`
                : "Everything in the year it is decided"}
            </option>
            {leadTimeChoices.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.isDefault ? " (default)" : ""} — {l.summary}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            With lead times, work is programmed in one year, paid for in another and built in a third — and each
            option is judged against the {words.item} it will meet in the year it is built, so a renewal can be programmed
            before the pipe needs it. Edit the sets under Settings &rsaquo; Delivery Lead Times.
          </p>
          {targeting && (
            <p className="text-xs text-muted-foreground">
              With lead times, the amount solved for is what has to be <em>committed</em> each year for the network to
              be there in the target year
              {values.afterTarget === "none"
                ? " — and nothing new is committed after it."
                : " — and after it, only what holds the target in the years that work is built. If the target year comes too soon for the work to be built by it, the run aims for the earliest year it can be reached instead."}
            </p>
          )}
        </div>
      )}

      {/* Only offered where formulas exist, so a system with none is not asked
          to choose between nothing and nothing. */}
      {criticalityChoices.length > 0 && (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor={id("criticalityModelId")}>Criticality formula</Label>
          <select
            id={id("criticalityModelId")}
            name="criticalityModelId"
            value={values.criticalityModelId}
            onChange={(e) => onChange({ criticalityModelId: e.target.value })}
            className={mark("criticalityModelId")}
          >
            <option value="">Whatever each asset type has active</option>
            {criticalityChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.assetTypeName}: {c.name}
                {c.isActive ? " (currently active)" : ""}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Ranks the work plans generated from this scenario, so two scenarios can be compared on what they treat as
            important. It does not change the condition flow on Model Results, which does not use criticality.
          </p>
        </div>
      )}
    </div>
  );
}

/** "id=weight" pairs, as the form holds them. */
function splitWeights(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split(",")
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf("=");
        return [pair.slice(0, at), pair.slice(at + 1)];
      })
  );
}

function joinWeights(weights: Record<string, string>): string {
  return Object.entries(weights)
    .filter(([, w]) => w.trim() !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, w]) => `${id}=${w.trim()}`)
    .join(",");
}

/**
 * Which modelled asset types the run covers, as a box per type. Every box
 * ticked is stored as no choice at all, so a type modelled later joins the
 * scenario; the last ticked box cannot be unticked, since a run over no asset
 * types has nothing to do.
 *
 * With more than one type ticked, each also takes a weight: a multiplier on
 * the Priority Score of its work, so the run can lean toward one type when
 * the types compete for the same budget. 1 for every type ranks them evenly.
 */
function AssetTypeField({
  choices,
  value,
  changed,
  onChange,
  weights,
  weightsChanged,
  onWeightsChange,
}: {
  choices: AssetTypeChoice[];
  value: string;
  changed: boolean;
  onChange: (value: string) => void;
  weights: string;
  weightsChanged: boolean;
  onWeightsChange: (value: string) => void;
}) {
  const all = choices.map((c) => c.id);
  const chosen = value ? value.split(",") : all;
  const typed = splitWeights(weights);
  const weighs = chosen.length > 1;
  const toggle = (id: string) => {
    const next = chosen.includes(id) ? chosen.filter((c) => c !== id) : [...chosen, id];
    onChange(next.length === all.length ? "" : [...next].sort().join(","));
  };
  const setWeight = (id: string, w: string) => onWeightsChange(joinWeights({ ...typed, [id]: w }));

  // Weights that would put each ticked type's typical score level with the
  // highest: offered, never applied on its own.
  const scored = choices.filter((c) => chosen.includes(c.id) && c.typicalPriority != null && c.typicalPriority > 0);
  const top = Math.max(...scored.map((c) => c.typicalPriority!));
  const level =
    weighs && scored.length > 1
      ? Object.fromEntries(scored.map((c) => [c.id, roundWeight(top / c.typicalPriority!)]))
      : null;
  return (
    <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
      <div className="text-sm font-medium">Asset types</div>
      {/* Posted only when narrowed: nothing posted is every modelled type. */}
      {value && chosen.map((id) => <input key={id} type="hidden" name="assetTypeIds" value={id} />)}
      <div
        className={`flex flex-wrap gap-x-5 gap-y-2 rounded-md border px-3 py-2 ${
          changed || weightsChanged ? "border-amber-500" : ""
        }`}
      >
        {choices.map((c) => {
          const on = chosen.includes(c.id);
          return (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={on && chosen.length === 1}
                  onChange={() => toggle(c.id)}
                />
                {c.name}
              </label>
              {weighs && on && (
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  ×
                  <input
                    type="number"
                    name={`assetTypeWeight.${c.id}`}
                    aria-label={`${c.name} weight`}
                    min={ASSET_TYPE_WEIGHT_RANGE.min}
                    max={ASSET_TYPE_WEIGHT_RANGE.max}
                    step="any"
                    value={typed[c.id] ?? "1"}
                    onChange={(e) => setWeight(c.id, e.target.value)}
                    className="h-7 w-16 rounded-md border border-input bg-background px-2 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {c.typicalPriority != null && (
                    <span className="tabular-nums" title="Median Priority Score of its work in the first year of the last run, before its weight">
                      typical {formatScore(c.typicalPriority)}
                    </span>
                  )}
                </label>
              )}
            </div>
          );
        })}
        {level && (
          <button
            type="button"
            onClick={() =>
              onWeightsChange(
                joinWeights({ ...typed, ...Object.fromEntries(Object.entries(level).map(([id, w]) => [id, String(w)])) })
              )
            }
            className="ml-auto text-xs font-medium text-primary underline-offset-2 hover:underline"
            title={`Sets ${scored.map((c) => `${c.name} ×${level[c.id]}`).join(", ")}`}
          >
            Level the types
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Run this scenario over some of the modelled asset types rather than all of them. Its averages, backlog and
        condition target are then those types&apos; alone.
        {weighs &&
          " The number beside each type multiplies the Priority Score of its work: above 1 favours that type when the types compete for the same budget, below 1 holds it back."}
        {weighs &&
          (scored.length > 1
            ? " Types' scores need not be on one scale — a length-based scale factor puts a main's far above a pole's — so each shows what its work typically scored in the last run, before its weight. Level the types sets the weights that bring those level; adjust from there."
            : " Each type's typical score appears here once the scenario has run.")}
      </p>
    </div>
  );
}
