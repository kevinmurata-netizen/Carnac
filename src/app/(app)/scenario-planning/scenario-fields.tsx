import { Label } from "@/components/ui/label";
import { STRATEGIES } from "@/domain/waterline/scenario";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Rates are stored as fractions but entered as percentages. Rounding matters:
 * 0.035 * 100 is 3.4999999999999996, which a number input renders in full. */
export function toPercent(rate: number) {
  return Math.round(rate * 10000) / 100;
}

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
};

/** The formulas that can rank this scenario's work plans. */
export type CriticalityChoice = { id: string; name: string; assetTypeName: string; isActive: boolean };

/**
 * The scenario parameter inputs, shared by the create and edit forms so the two
 * cannot drift apart. `idPrefix` keeps label/input ids unique when both forms
 * are ever on one page.
 */
export function ScenarioFields({
  defaults,
  idPrefix = "",
  criticalityChoices = [],
}: {
  defaults: ScenarioFieldDefaults;
  idPrefix?: string;
  criticalityChoices?: CriticalityChoice[];
}) {
  const id = (name: string) => `${idPrefix}${name}`;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={id("name")}>Scenario Name</Label>
        <input
          id={id("name")}
          name="name"
          required
          placeholder="e.g. Preventive Strategy"
          defaultValue={defaults.name}
          className={input}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={id("description")}>Description</Label>
        <input id={id("description")} name="description" defaultValue={defaults.description} className={input} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("annualBudget")}>Annual Budget ($)</Label>
        <input
          id={id("annualBudget")}
          name="annualBudget"
          type="number"
          min={0}
          step={100000}
          defaultValue={defaults.annualBudget}
          className={input}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("fundingGrowthPct")}>Funding Growth (%/yr)</Label>
        <input
          id={id("fundingGrowthPct")}
          name="fundingGrowthPct"
          type="number"
          step={0.5}
          defaultValue={defaults.fundingGrowthPct}
          className={input}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("discountRatePct")}>Discount Rate (%)</Label>
        <input
          id={id("discountRatePct")}
          name="discountRatePct"
          type="number"
          step={0.25}
          defaultValue={defaults.discountRatePct}
          className={input}
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
          defaultValue={defaults.analysisPeriodYears}
          className={input}
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
          defaultValue={defaults.conditionTarget}
          className={input}
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
          defaultValue={defaults.riskThreshold}
          className={input}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={id("strategy")}>Prioritization Strategy</Label>
        <select id={id("strategy")} name="strategy" defaultValue={defaults.strategy} className={input}>
          {STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Only offered where formulas exist, so a system with none is not asked
          to choose between nothing and nothing. */}
      {criticalityChoices.length > 0 && (
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor={id("criticalityModelId")}>Criticality formula</Label>
          <select
            id={id("criticalityModelId")}
            name="criticalityModelId"
            defaultValue={defaults.criticalityModelId ?? ""}
            className={input}
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
