"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SimpleLineChart, type LineSeries } from "@/components/charts/simple-line-chart";
import { evaluateCurve, type CurveParams } from "@/domain/waterline/deterioration";

export type CurveModel = {
  id: string;
  name: string;
  material: string | null;
  isActive: boolean;
  curve: CurveParams;
  color: string;
};

/**
 * Plots the configured deterioration curves, individually toggleable.
 *
 * The curves come from the models saved in Settings rather than the seeded
 * constants, so editing a service life or shape is visible here immediately —
 * which is the point of being able to compare them.
 */
export function CurveExplorer({
  models,
  conditionTarget,
}: {
  models: CurveModel[];
  conditionTarget: number;
}) {
  const [shown, setShown] = useState<Set<string>>(() => new Set(models.map((m) => m.id)));

  const allShown = models.length > 0 && shown.size === models.length;
  const noneShown = shown.size === 0;

  const toggle = (id: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selected = models.filter((m) => shown.has(m.id));

  const { rows, series } = useMemo(() => {
    // Plot to the longest selected service life so a short-lived material is
    // not stretched across an axis it never reaches.
    const horizon = Math.max(1, ...selected.map((m) => m.curve.serviceLife));
    const step = horizon > 60 ? 5 : horizon > 30 ? 2 : 1;

    const rows: Array<Record<string, string | number | null>> = [];
    for (let age = 0; age <= horizon; age += step) {
      const row: Record<string, string | number | null> = { age };
      for (const m of selected) {
        // Past its service life a curve is flat at its floor; showing it as
        // null instead would imply we stopped knowing, which is not the case.
        row[m.id] = evaluateCurve(m.curve, age);
      }
      rows.push(row);
    }

    const series: LineSeries[] = selected.map((m) => ({
      key: m.id,
      label: m.material ?? m.name,
      color: m.color,
      dashed: !m.isActive,
    }));

    return { rows, series };
  }, [selected]);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Deterioration Curves</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Condition against age for a new segment of each material, as currently configured.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => setShown(allShown ? new Set() : new Set(models.map((m) => m.id)))}
        >
          {allShown ? "Hide all" : "Show all"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {models.map((m) => {
            const on = shown.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  on
                    ? "border-transparent bg-muted font-medium text-foreground"
                    : "border-dashed text-muted-foreground hover:text-foreground"
                }`}
                title={`${m.curve.serviceLife} yr service life · shape ${m.curve.shape}${
                  m.isActive ? "" : " · inactive"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: on ? m.color : "transparent", border: `1px solid ${m.color}` }}
                />
                {m.material ?? m.name}
                {!m.isActive && <span className="text-muted-foreground/70">(off)</span>}
              </button>
            );
          })}
        </div>

        {noneShown ? (
          <div className="flex h-[260px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Nothing selected — pick a material above, or Show all.
          </div>
        ) : (
          <SimpleLineChart
            data={rows}
            xKey="age"
            yDomain={[0, 100]}
            height={300}
            referenceY={conditionTarget}
            referenceLabel={`Target ${conditionTarget}`}
            series={series}
          />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Showing <span className="font-medium text-foreground">{selected.length}</span> of {models.length}
          </span>
          {selected.length > 0 && (
            <>
              <span>
                Shortest life{" "}
                <span className="font-medium text-foreground">
                  {Math.min(...selected.map((m) => m.curve.serviceLife))} yr
                </span>
              </span>
              <span>
                Longest{" "}
                <span className="font-medium text-foreground">
                  {Math.max(...selected.map((m) => m.curve.serviceLife))} yr
                </span>
              </span>
            </>
          )}
          {models.some((m) => !m.isActive) && <span>Dashed lines are inactive models.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
