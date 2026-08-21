"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import type { DeteriorationModelConfig } from "@/server/settings";
import { evaluateCurve } from "@/domain/waterline/deterioration";
import { saveDeteriorationModelAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";
import { formatNumber } from "@/lib/format";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DeteriorationModelEditor({ model }: { model: DeteriorationModelConfig }) {
  const [state, action] = useActionState(saveDeteriorationModelAction, EMPTY_SETTINGS_STATE);

  // Sampled from the stored curve, so the preview shows what is saved rather
  // than what is currently typed — it updates once the save lands.
  const marks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const age = Math.round(model.curve.serviceLife * f);
    return { age, condition: Math.round(evaluateCurve(model.curve, age)) };
  });

  return (
    <form action={action}>
      <input type="hidden" name="id" value={model.id} />
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{model.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {model.material ? `Applies to ${model.material}` : "No material filter"} · {model.modelType} ·{" "}
              {formatNumber(model.predictionCount)} predictions
            </p>
          </div>
          <Badge variant={model.isActive ? "default" : "secondary"}>{model.isActive ? "Active" : "Inactive"}</Badge>
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
                defaultValue={model.curve.serviceLife}
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
                defaultValue={model.curve.shape}
                className={input}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked={model.isActive} className="h-4 w-4 accent-primary" />
                Active
              </label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`init-${model.id}`}>Initial Condition</Label>
              <input
                id={`init-${model.id}`}
                name="initialCondition"
                type="number"
                defaultValue={model.curve.initialCondition}
                className={input}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`min-${model.id}`}>Minimum Condition</Label>
              <input
                id={`min-${model.id}`}
                name="minCondition"
                type="number"
                defaultValue={model.curve.minCondition}
                className={input}
              />
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3">
            <div className="mb-2 text-xs font-medium text-foreground">Saved curve</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              {marks.map((m) => (
                <span key={m.age}>
                  {m.age} yr → <span className="font-medium text-foreground">{m.condition}</span>
                </span>
              ))}
            </div>
          </div>

          <SaveBar
            state={state}
            label="Save curve"
            hint="Shape above 1 decays slowly then accelerates; below 1 drops early then flattens."
          />
        </CardContent>
      </Card>
    </form>
  );
}
