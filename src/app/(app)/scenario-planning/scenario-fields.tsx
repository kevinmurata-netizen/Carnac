"use client";

import { Label } from "@/components/ui/label";
import { STRATEGIES } from "@/domain/waterline/scenario";

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
};

export type ScenarioFieldDefaults = {
  name: string;
  description: string;
  annualBudget: number;
  fundingGrowthPct: number;
  discountRatePct: number;
  analysisPeriodYears: number;
  conditionTarget: number;
  riskThreshold: number;
  strategy: string;
  criticalityModelId: string | null;
  weightSetId: string | null;
  categoryWeightSetId: string | null;
  categoryFundingPlanId: string | null;
};

export function toValues(d: ScenarioFieldDefaults): ScenarioValues {
  return {
    name: d.name,
    description: d.description,
    annualBudget: String(d.annualBudget),
    fundingGrowthPct: String(d.fundingGrowthPct),
    discountRatePct: String(d.discountRatePct),
    analysisPeriodYears: String(d.analysisPeriodYears),
    conditionTarget: String(d.conditionTarget),
    riskThreshold: String(d.riskThreshold),
    strategy: d.strategy,
    criticalityModelId: d.criticalityModelId ?? "",
    weightSetId: d.weightSetId ?? "",
    categoryWeightSetId: d.categoryWeightSetId ?? "",
    categoryFundingPlanId: d.categoryFundingPlanId ?? "",
  };
}

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
}) {
  const id = (name: string) => `${idPrefix}${name}`;
  const mark = (key: keyof ScenarioValues) =>
    saved && values[key] !== saved[key] ? `${input} border-amber-500` : input;

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
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("conditionTarget")}>Condition Target (WCI)</Label>
        <input
          id={id("conditionTarget")}
          name="conditionTarget"
          type="number"
          min={0}
          max={100}
          value={values.conditionTarget}
          onChange={(e) => onChange({ conditionTarget: e.target.value })}
          className={mark("conditionTarget")}
        />
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
            <option value="">No category order — one pass down the ranked list</option>
            {fundingPlanChoices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? " (default)" : ""} — {p.summary}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            How much of each year goes to each kind of work, and which kind is funded first. Unlike the weighting
            above, this does not change what ranks highest — it decides what the money buys. Edit the plans under
            Settings &rsaquo; Category Funding.
          </p>
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
