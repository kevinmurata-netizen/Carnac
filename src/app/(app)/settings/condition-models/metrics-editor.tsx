"use client";

import { useActionState, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { MetricConfig, MetricSourceOption } from "@/server/metrics";
import { createMetricAction, saveMetricAction, deleteMetricAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";
import { formatNumber } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type BandRow = { key: string; label: string; min: number; max: number; color: string };

const NEW_METRIC_BANDS: BandRow[] = [
  { key: "b0", label: "High", min: 67, max: 100, color: "#16a34a" },
  { key: "b1", label: "Medium", min: 34, max: 66, color: "#eab308" },
  { key: "b2", label: "Low", min: 0, max: 33, color: "#dc2626" },
];

function BandRows({
  bands,
  setBands,
  scaleMin,
}: {
  bands: BandRow[];
  setBands: (fn: (prev: BandRow[]) => BandRow[]) => void;
  scaleMin: number;
}) {
  const update = (key: string, patch: Partial<BandRow>) =>
    setBands((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const sorted = [...bands].sort((a, b) => b.min - a.min);
  const lowest = sorted[sorted.length - 1];
  const coversFloor = lowest ? lowest.min <= scaleMin : false;

  return (
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

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          setBands((prev) => [
            ...prev,
            { key: `new${Date.now()}`, label: "New band", min: scaleMin, max: scaleMin, color: "#6b7280" },
          ])
        }
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add band
      </Button>

      {!coversFloor && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
          The lowest band starts at {lowest?.min}, above the scale minimum of {scaleMin}. Values below {lowest?.min}{" "}
          would fall in no band — lower it to {scaleMin} before saving.
        </div>
      )}
    </div>
  );
}

export function NewMetricForm({ sources }: { sources: MetricSourceOption[] }) {
  const [state, action] = useActionState(createMetricAction, EMPTY_SETTINGS_STATE);
  const [bands, setBands] = useState<BandRow[]>(NEW_METRIC_BANDS);
  const [selected, setSelected] = useState("");
  const [scaleMin, setScaleMin] = useState(0);
  const [scaleMax, setScaleMax] = useState(100);

  const available = useMemo(() => sources.filter((s) => !s.inUse), [sources]);
  const source = sources.find((s) => `${s.kind}:${s.code}` === selected);

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Add a Metric</CardTitle>
        <p className="text-xs text-muted-foreground">
          A metric bands the values already recorded against a numeric inspection or inventory field. Nothing new is
          collected — it reads what the database holds.
        </p>
      </CardHeader>
      <CardContent>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every numeric field already has a metric. Add a numeric field under Administration → Fields to create
            another.
          </p>
        ) : (
          <form action={action} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="metric-name">Metric Name</Label>
                <input id="metric-name" name="name" required placeholder="e.g. Pipe Diameter" className={input} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="metric-source">Measures</Label>
                <select
                  id="metric-source"
                  name="source"
                  required
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className={input}
                >
                  <option value="">Choose a field…</option>
                  <optgroup label="Inventory attributes">
                    {available
                      .filter((s) => s.kind === "inventory")
                      .map((s) => (
                        <option key={`inventory:${s.code}`} value={`inventory:${s.code}`}>
                          {s.label} ({formatNumber(s.valueCount)} values)
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Inspection fields">
                    {available
                      .filter((s) => s.kind === "inspection")
                      .map((s) => (
                        <option key={`inspection:${s.code}`} value={`inspection:${s.code}`}>
                          {s.label} ({formatNumber(s.valueCount)} values)
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metric-scale-min">Scale Minimum</Label>
                <input
                  id="metric-scale-min"
                  name="scaleMin"
                  type="number"
                  value={scaleMin}
                  onChange={(e) => setScaleMin(Number(e.target.value))}
                  className={input}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metric-scale-max">Scale Maximum</Label>
                <input
                  id="metric-scale-max"
                  name="scaleMax"
                  type="number"
                  value={scaleMax}
                  onChange={(e) => setScaleMax(Number(e.target.value))}
                  className={input}
                />
              </div>
            </div>

            {source && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{source.label}</span>
                {source.unit ? ` (${source.unit})` : ""} — {formatNumber(source.valueCount)} assets carry a value
                {source.observedMin != null && (
                  <>
                    , ranging {source.observedMin} to {source.observedMax}
                  </>
                )}
                . Set the scale to cover that range or values will fall outside every band.
              </div>
            )}

            <div>
              <div className="mb-2 text-sm font-medium text-foreground">Bands</div>
              <BandRows bands={bands} setBands={setBands} scaleMin={scaleMin} />
            </div>

            <SaveBar state={state} label="Create metric" hint="Bands work the same way as the condition index." />
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricEditor({ metric }: { metric: MetricConfig }) {
  const [state, action] = useActionState(saveMetricAction, EMPTY_SETTINGS_STATE);
  const [deleteState, deleteAction] = useActionState(deleteMetricAction, EMPTY_SETTINGS_STATE);
  const [bands, setBands] = useState<BandRow[]>(
    metric.bands.map((b, i) => ({ key: `b${i}`, label: b.label, min: b.min, max: b.max, color: b.color }))
  );
  const [scaleMin, setScaleMin] = useState(metric.scaleMin);

  const total = metric.distribution.reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">{metric.name}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Measures <span className="font-medium text-foreground">{metric.source.label}</span>
            {metric.source.unit ? ` (${metric.source.unit})` : ""} ·{" "}
            {metric.source.kind === "inventory" ? "inventory attribute" : "inspection field"}
          </p>
        </div>
        <Badge variant="secondary">{formatNumber(metric.assetsMeasured)} measured</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {metric.assetsMeasured > 0 ? (
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 text-xs text-muted-foreground">
              <span>
                min <span className="font-medium text-foreground">{metric.observedMin}</span>
              </span>
              <span>
                avg <span className="font-medium text-foreground">{metric.observedAvg}</span>
              </span>
              <span>
                max <span className="font-medium text-foreground">{metric.observedMax}</span>
              </span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full">
              {metric.distribution.map((d) => (
                <div
                  key={d.label}
                  style={{ width: `${total ? (d.count / total) * 100 : 0}%`, backgroundColor: d.color }}
                  title={`${d.label}: ${d.count}`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {metric.distribution.map((d) => (
                <span key={d.label} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: d.color }} />
                  {d.label} {formatNumber(d.count)}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            No assets carry a value for {metric.source.label} yet, so this metric has nothing to measure.
          </div>
        )}

        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={metric.id} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`m-name-${metric.id}`}>Metric Name</Label>
              <input id={`m-name-${metric.id}`} name="name" defaultValue={metric.name} className={input} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`m-min-${metric.id}`}>Scale Minimum</Label>
              <input
                id={`m-min-${metric.id}`}
                name="scaleMin"
                type="number"
                value={scaleMin}
                onChange={(e) => setScaleMin(Number(e.target.value))}
                className={input}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`m-max-${metric.id}`}>Scale Maximum</Label>
              <input
                id={`m-max-${metric.id}`}
                name="scaleMax"
                type="number"
                defaultValue={metric.scaleMax}
                className={input}
              />
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-foreground">Bands</div>
            <BandRows bands={bands} setBands={setBands} scaleMin={scaleMin} />
          </div>

          <SaveBar state={state} label="Save metric" />
        </form>

        <form action={deleteAction} className="flex items-center justify-between gap-3 border-t pt-4">
          <input type="hidden" name="id" value={metric.id} />
          <span className="text-xs text-destructive">{deleteState.message}</span>
          <Button type="submit" size="sm" variant="destructive">
            Delete metric
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
