"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { STRATEGIES, STRATEGY_DESCRIPTIONS } from "@/domain/waterline/scenario";
import {
  ScenarioFields,
  toValues,
  type ScenarioFieldDefaults,
  type ScenarioValues,
  type CriticalityChoice,
  type WeightSetChoice,
  type CategoryWeightSetChoice,
  type FundingPlanChoice,
} from "./scenario-fields";
import { RunProgressButton } from "./run-progress";
import { OptionPicker, type OptionPickerValue } from "./option-picker";
import { SCENARIO_EDIT_FORM_ID, useScenarioEdit } from "./scenario-edit-state";
import type { RunEstimate } from "@/server/run-estimate";
import type { OptionChoice } from "@/server/scenario-options";

function Strategies() {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
      <div className="mb-1 font-medium text-foreground">Strategies</div>
      <ul className="space-y-0.5">
        {STRATEGIES.map((s) => (
          <li key={s}>
            <span className="font-medium">{s}</span> — {STRATEGY_DESCRIPTIONS[s]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Editing an existing scenario.
 *
 * Holds the values so each field can be compared against what is stored: a
 * scenario has eleven inputs spread over two screens, and saving re-runs the
 * simulation, so "you have changed something, and here is what" is worth
 * saying before someone spends a run finding out.
 */
export function ScenarioEditForm({
  scenarioId,
  action,
  criticalityChoices,
  weightSetChoices,
  categoryWeightSetChoices,
  fundingPlanChoices,
  treatmentChoices,
  combinationChoices,
}: {
  scenarioId: string;
  action: (formData: FormData) => void;
  criticalityChoices: CriticalityChoice[];
  weightSetChoices: WeightSetChoice[];
  categoryWeightSetChoices: CategoryWeightSetChoice[];
  fundingPlanChoices: FundingPlanChoice[];
  treatmentChoices: OptionChoice[];
  combinationChoices: OptionChoice[];
}) {
  // State lives in the provider, because the button that submits this form is
  // in the page header and has to know whether anything changed.
  const edit = useScenarioEdit();
  if (!edit) throw new Error("ScenarioEditForm must be rendered inside a ScenarioEditProvider");

  const { values, patch, saved, options, setOptions, savedOptions } = edit;

  return (
    <form id={SCENARIO_EDIT_FORM_ID} action={action} className="space-y-4">
      <input type="hidden" name="scenarioId" value={scenarioId} />

      <ScenarioFields
        idPrefix="edit-"
        values={values}
        onChange={patch}
        saved={saved}
        criticalityChoices={criticalityChoices}
        weightSetChoices={weightSetChoices}
        categoryWeightSetChoices={categoryWeightSetChoices}
        fundingPlanChoices={fundingPlanChoices}
      />

      <Strategies />

      <OptionPicker
        idPrefix="edit-"
        treatments={treatmentChoices}
        combinations={combinationChoices}
        value={options}
        onChange={setOptions}
        saved={savedOptions}
      />

      {/* The submit is in the page header now, where it is reachable without
          scrolling past two screens of inputs. This says where it went rather
          than leaving the form looking unfinished. */}
      <p className="border-t pt-4 text-xs text-muted-foreground">
        {edit.dirty ? (
          <>
            <span className="font-medium text-amber-600">
              {edit.changedCount} unsaved change{edit.changedCount === 1 ? "" : "s"}
            </span>{" "}
            — Save &amp; Re-run is at the top of the page. Saving re-runs the simulation immediately: results and the
            funded project list are replaced, so what you see always matches these parameters.
          </>
        ) : (
          <>
            Saving re-runs the simulation immediately — results and the funded project list are replaced, so what you
            see always matches these parameters. The button is at the top of the page.
          </>
        )}
      </p>
    </form>
  );
}

/**
 * Creating one. No change marks: there is nothing stored to have changed from,
 * and ringing every field that differs from a default would mark most of the
 * form on a scenario someone deliberately configured.
 */
export function ScenarioCreateForm({
  defaults,
  action,
  estimate,
  criticalityChoices,
  weightSetChoices,
  categoryWeightSetChoices,
  fundingPlanChoices,
  treatmentChoices,
  combinationChoices,
}: {
  defaults: ScenarioFieldDefaults;
  action: (formData: FormData) => void;
  estimate: RunEstimate;
  criticalityChoices: CriticalityChoice[];
  weightSetChoices: WeightSetChoice[];
  categoryWeightSetChoices: CategoryWeightSetChoice[];
  fundingPlanChoices: FundingPlanChoice[];
  treatmentChoices: OptionChoice[];
  combinationChoices: OptionChoice[];
}) {
  const [values, setValues] = useState<ScenarioValues>(() => toValues(defaults));
  const patch = (change: Partial<ScenarioValues>) => setValues((v) => ({ ...v, ...change }));
  const [options, setOptions] = useState<OptionPickerValue>({
    limitsOptions: false,
    treatments: [],
    combinations: [],
  });

  return (
    <form action={action} className="space-y-4">
      <ScenarioFields
        values={values}
        onChange={patch}
        criticalityChoices={criticalityChoices}
        weightSetChoices={weightSetChoices}
        categoryWeightSetChoices={categoryWeightSetChoices}
        fundingPlanChoices={fundingPlanChoices}
      />

      <Strategies />

      <OptionPicker
        treatments={treatmentChoices}
        combinations={combinationChoices}
        value={options}
        onChange={setOptions}
      />

      {/* Creating runs the scenario immediately, so there is nothing
          half-made to come back to — Cancel is simply "not this". */}
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="outline" nativeButton={false} render={<Link href="/scenario-planning">Cancel</Link>} />
        <RunProgressButton
          estimate={estimate}
          label="Create & Run Scenario"
          runningLabel="Creating and running…"
          size="default"
        />
      </div>
    </form>
  );
}
