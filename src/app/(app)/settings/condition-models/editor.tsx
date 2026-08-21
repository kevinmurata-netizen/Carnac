"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ConditionModelConfig } from "@/server/settings";
import { saveConditionModelAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";
import { Plus, Trash2 } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type BandRow = { key: string; label: string; min: number; max: number; color: string };

export function ConditionModelEditor({ config }: { config: ConditionModelConfig }) {
  const [state, action] = useActionState(saveConditionModelAction, EMPTY_SETTINGS_STATE);
  const [bands, setBands] = useState<BandRow[]>(
    config.bands.map((b, i) => ({ key: `b${i}`, label: b.label, min: b.min, max: b.max, color: b.color }))
  );

  const update = (key: string, patch: Partial<BandRow>) =>
    setBands((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const addBand = () =>
    setBands((prev) => [
      ...prev,
      { key: `new${Date.now()}`, label: "New band", min: 0, max: 0, color: "#6b7280" },
    ]);

  const sorted = [...bands].sort((a, b) => b.min - a.min);
  const lowest = sorted[sorted.length - 1];
  const coversFloor = lowest ? lowest.min <= config.scaleMin : false;

  return (
    <form action={action}>
      <Card>
        <CardHeader>
          <CardTitle>Model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="name">Model Name</Label>
              <input id="name" name="name" defaultValue={config.name} className={input} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scaleMin">Scale Minimum</Label>
              <input id="scaleMin" name="scaleMin" type="number" defaultValue={config.scaleMin} className={input} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scaleMax">Scale Maximum</Label>
              <input id="scaleMax" name="scaleMax" type="number" defaultValue={config.scaleMax} className={input} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            Bands <span className="text-sm font-normal text-muted-foreground">({bands.length})</span>
          </CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={addBand}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add band
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {sorted.map((b) => (
              <div key={b.key} className="grid grid-cols-12 items-end gap-2 rounded-md border p-3">
                <div className="col-span-12 space-y-1.5 sm:col-span-4">
                  <Label className="text-xs">Label</Label>
                  <input
                    name={`bandLabel_${b.key}`}
                    value={b.label}
                    onChange={(e) => update(b.key, { label: e.target.value })}
                    className={input}
                  />
                </div>
                <div className="col-span-4 space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">From</Label>
                  <input
                    name={`bandMin_${b.key}`}
                    type="number"
                    value={b.min}
                    onChange={(e) => update(b.key, { min: Number(e.target.value) })}
                    className={input}
                  />
                </div>
                <div className="col-span-4 space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">To</Label>
                  <input
                    name={`bandMax_${b.key}`}
                    type="number"
                    value={b.max}
                    onChange={(e) => update(b.key, { max: Number(e.target.value) })}
                    className={input}
                  />
                </div>
                <div className="col-span-4 space-y-1.5 sm:col-span-3">
                  <Label className="text-xs">Colour</Label>
                  <div className="flex items-center gap-2">
                    <input
                      name={`bandColor_${b.key}`}
                      type="color"
                      value={b.color}
                      onChange={(e) => update(b.key, { color: e.target.value })}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background"
                    />
                    <span className="truncate font-mono text-xs text-muted-foreground">{b.color}</span>
                  </div>
                </div>
                <div className="col-span-12 flex justify-end sm:col-span-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={bands.length <= 1}
                    onClick={() => setBands((prev) => prev.filter((x) => x.key !== b.key))}
                    aria-label={`Remove ${b.label}`}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {!coversFloor && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
              The lowest band starts at {lowest?.min}, above the scale minimum of {config.scaleMin}. Scores below{" "}
              {lowest?.min} would have no band — lower it to {config.scaleMin} before saving.
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            A score falls in the highest band whose <span className="font-medium">From</span> it reaches, so bands must
            leave no gap. <span className="font-medium">To</span> is shown to readers but is not used for matching —
            that is what keeps a fractional score like 69.2 out of the band below it. These bands drive every condition
            colour, grade label and distribution chart in the system, and {config.measurementCount.toLocaleString()}{" "}
            existing measurements will be re-graded against them immediately.
          </p>

          <SaveBar state={state} label="Save model" hint="Changes take effect across the system as soon as you save." />
        </CardContent>
      </Card>
    </form>
  );
}
