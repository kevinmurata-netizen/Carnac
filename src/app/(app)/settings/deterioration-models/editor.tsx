"use client";

import { useActionState, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { DeteriorationModelConfig } from "@/server/settings";
import { evaluateCurve, type CurveParams } from "@/domain/waterline/deterioration";
import { SimpleLineChart } from "@/components/charts/simple-line-chart";
import { saveDeteriorationModelAction, toggleDeteriorationActiveAction } from "../actions";
import { ActiveToggle } from "@/components/settings/active-toggle";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";
import { formatNumber } from "@/lib/format";
import { LineChart, RotateCcw } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Ages at which the two curves are compared in the readout. */
const COMPARE_FRACTIONS = [0.25, 0.5, 0.75, 1];

export function DeteriorationModelEditor({
  model,
  showGraph,
  onShowGraphChange,
}: {
  model: DeteriorationModelConfig;
  /** Controlled by the list so one button can toggle every curve. */
  showGraph: boolean;
  onShowGraphChange: (next: boolean) => void;
}) {
  const [state, action] = useActionState(saveDeteriorationModelAction, EMPTY_SETTINGS_STATE);

  const [draft, setDraft] = useState<CurveParams>(model.curve);

  const set = (patch: Partial<CurveParams>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    // Opening the graph on the first edit is the whole point of the preview —
    // otherwise you would change a number and see nothing.
    onShowGraphChange(true);
  };

  const changed = (["initialCondition", "minCondition", "serviceLife", "shape"] as const).some(
    (k) => draft[k] !== model.curve[k]
  );

  const valid = draft.serviceLife > 0 && draft.shape > 0 && draft.minCondition < draft.initialCondition;

  const { rows, comparisons } = useMemo(() => {
    const horizon = Math.max(model.curve.serviceLife, valid ? draft.serviceLife : 0, 1);
    const step = horizon > 60 ? 5 : horizon > 30 ? 2 : 1;

    const rows: Array<Record<string, string | number | null>> = [];
    for (let age = 0; age <= horizon; age += step) {
      rows.push({
        age,
        saved: evaluateCurve(model.curve, age),
        ...(changed && valid ? { preview: evaluateCurve(draft, age) } : {}),
      });
    }

    const comparisons = COMPARE_FRACTIONS.map((f) => {
      const age = Math.round(model.curve.serviceLife * f);
      return {
        age,
        saved: evaluateCurve(model.curve, age),
        preview: changed && valid ? evaluateCurve(draft, age) : null,
      };
    });

    return { rows, comparisons };
  }, [model.curve, draft, changed, valid]);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={model.id} />
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base">{model.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {model.material ? `Applies to ${model.material}` : "No material filter"} · {model.modelType} ·{" "}
              {formatNumber(model.predictionCount)} predictions
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {changed && <Badge variant="secondary">Unsaved</Badge>}
            <ActiveToggle
              id={model.id}
              isActive={model.isActive}
              action={toggleDeteriorationActiveAction}
              activeHint="Click to deactivate — this material falls back to the default curve in every forecast and scenario run"
              inactiveHint="Click to activate — this curve shapes forecasts again"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => onShowGraphChange(!showGraph)}>
              <LineChart className="mr-1 h-3.5 w-3.5" />
              {showGraph ? "Hide curve" : "Show curve"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor={`name-${model.id}`}>Name</Label>
              <input id={`name-${model.id}`} name="name" defaultValue={model.name} className={input} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`life-${model.id}`}>Service Life (yr)</Label>
              <input
                id={`life-${model.id}`}
                name="serviceLife"
                type="number"
                min={1}
                step={1}
                value={draft.serviceLife}
                onChange={(e) => set({ serviceLife: Number(e.target.value) })}
                className={input}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`shape-${model.id}`}>Curve Shape</Label>
              <input
                id={`shape-${model.id}`}
                name="shape"
                type="number"
                min={0.1}
                step={0.1}
                value={draft.shape}
                onChange={(e) => set({ shape: Number(e.target.value) })}
                className={input}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`init-${model.id}`}>Initial Condition</Label>
              <input
                id={`init-${model.id}`}
                name="initialCondition"
                type="number"
                value={draft.initialCondition}
                onChange={(e) => set({ initialCondition: Number(e.target.value) })}
                className={input}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`min-${model.id}`}>Minimum Condition</Label>
              <input
                id={`min-${model.id}`}
                name="minCondition"
                type="number"
                value={draft.minCondition}
                onChange={(e) => set({ minCondition: Number(e.target.value) })}
                className={input}
              />
            </div>
          </div>

          {showGraph && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  {changed && valid ? "Saved curve vs your changes" : "Saved curve"}
                </span>
                {changed && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setDraft(model.curve)}
                    title="Discard unsaved changes"
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Revert
                  </Button>
                )}
              </div>

              <SimpleLineChart
                data={rows}
                xKey="age"
                yDomain={[0, 100]}
                height={240}
                series={[
                  { key: "saved", label: "Saved", color: "var(--color-chart-3)", dashed: changed && valid },
                  ...(changed && valid
                    ? [{ key: "preview", label: "Preview", color: "var(--color-chart-1)" }]
                    : []),
                ]}
              />

              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                {comparisons.map((c) => (
                  <span key={c.age}>
                    {c.age} yr → <span className="font-medium text-foreground">{c.saved}</span>
                    {c.preview != null && c.preview !== c.saved && (
                      <>
                        {" → "}
                        <span className="font-medium text-primary">{c.preview}</span>
                      </>
                    )}
                  </span>
                ))}
              </div>

              {changed && !valid && (
                <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
                  These values cannot be plotted — service life and shape must be above zero, and the minimum
                  condition must be below the initial condition. Saving would be rejected too.
                </div>
              )}
            </div>
          )}

          <SaveBar
            state={state}
            label={changed ? "Save curve" : "Save"}
            hint={
              changed
                ? "Nothing is stored until you save — the preview is only a drawing."
                : "Shape above 1 decays slowly then accelerates; below 1 drops early then flattens."
            }
          />
        </CardContent>
      </Card>
    </form>
  );
}
