"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CircleDot } from "lucide-react";
import { STRATEGIES, STRATEGY_DESCRIPTIONS } from "@/domain/waterline/scenario";
import {
  ScenarioFields,
  toValues,
  type ScenarioFieldDefaults,
  type ScenarioValues,
  type CriticalityChoice,
  type WeightSetChoice,
} from "./scenario-fields";
import { RunProgressButton } from "./run-progress";
import type { RunEstimate } from "@/server/run-estimate";

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
  defaults,
  action,
  estimate,
  criticalityChoices,
  weightSetChoices,
}: {
  scenarioId: string;
  defaults: ScenarioFieldDefaults;
  action: (formData: FormData) => void;
  estimate: RunEstimate;
  criticalityChoices: CriticalityChoice[];
  weightSetChoices: WeightSetChoice[];
}) {
  // The stored values, and what is in the boxes now. Both start from the same
  // place; the component is remounted by its caller after a save, which is
  // what makes `saved` the freshly stored values rather than stale ones.
  const [saved] = useState<ScenarioValues>(() => toValues(defaults));
  const [values, setValues] = useState<ScenarioValues>(saved);
  const patch = (change: Partial<ScenarioValues>) => setValues((v) => ({ ...v, ...change }));

  const changedCount = (Object.keys(values) as Array<keyof ScenarioValues>).filter(
    (k) => values[k] !== saved[k]
  ).length;
  const dirty = changedCount > 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="scenarioId" value={scenarioId} />

      <ScenarioFields
        idPrefix="edit-"
        values={values}
        onChange={patch}
        saved={saved}
        criticalityChoices={criticalityChoices}
        weightSetChoices={weightSetChoices}
      />

      <Strategies />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Saving re-runs the simulation immediately — results and the funded project list are replaced, so what you
          see always matches these parameters.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {dirty && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
              <CircleDot className="h-3 w-3" />
              {changedCount} unsaved change{changedCount === 1 ? "" : "s"}
            </span>
          )}
          {dirty && (
            <Button type="button" size="sm" variant="outline" onClick={() => setValues(saved)}>
              Discard changes
            </Button>
          )}
          <RunProgressButton
            estimate={estimate}
            label="Save & Re-run"
            runningLabel="Saving and running…"
            size="default"
          />
        </div>
      </div>
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
}: {
  defaults: ScenarioFieldDefaults;
  action: (formData: FormData) => void;
  estimate: RunEstimate;
  criticalityChoices: CriticalityChoice[];
  weightSetChoices: WeightSetChoice[];
}) {
  const [values, setValues] = useState<ScenarioValues>(() => toValues(defaults));
  const patch = (change: Partial<ScenarioValues>) => setValues((v) => ({ ...v, ...change }));

  return (
    <form action={action} className="space-y-4">
      <ScenarioFields
        values={values}
        onChange={patch}
        criticalityChoices={criticalityChoices}
        weightSetChoices={weightSetChoices}
      />

      <Strategies />

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
