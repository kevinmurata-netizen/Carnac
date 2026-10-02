"use client";

import { useState } from "react";
import { LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComponentCurveConfig } from "@/server/component-deterioration";
import { COMPONENT_SERVICE_LIVES, FALLBACK_COMPONENT_LIFE } from "@/domain/components/deterioration";
import { formatNumber } from "@/lib/format";
import { DeteriorationModelEditor } from "./editor";

/**
 * The component curves, one group per kind of asset — a coating on a
 * reservoir and a pump in a well are separate questions with separate
 * answers. Each is the same editor the material curves use, so a component
 * curve is read, previewed and saved the same way.
 */
export function ComponentCurveList({ curves }: { curves: ComponentCurveConfig[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const groups = [...new Set(curves.map((c) => c.assetTypeName))].map((name) => ({
    name,
    curves: curves.filter((c) => c.assetTypeName === name),
  }));

  const toggleGroup = (ids: string[], show: boolean) =>
    setOpen((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (show) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const ids = group.curves.map((c) => c.id);
        const allOpen = ids.every((id) => open.has(id));
        return (
          <section key={group.name} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium">
                {group.name} <span className="text-muted-foreground">({group.curves.length})</span>
              </h3>
              <Button type="button" size="sm" variant="outline" onClick={() => toggleGroup(ids, !allOpen)}>
                <LineChart className="mr-1 h-3.5 w-3.5" />
                {allOpen ? "Hide curves" : "Show curves"}
              </Button>
            </div>
            {group.curves.map((c) => {
              const typical = COMPONENT_SERVICE_LIVES[c.componentTypeCode] ?? FALLBACK_COMPONENT_LIFE;
              return (
                <DeteriorationModelEditor
                  // Keyed on the saved values, as the material curves are, so
                  // a save remounts the editor with what was written.
                  key={[c.id, c.name, c.isActive, c.curve.serviceLife, c.curve.shape, c.curve.initialCondition, c.curve.minCondition].join("|")}
                  model={{
                    id: c.id,
                    name: c.name,
                    modelType: c.modelType,
                    material: null,
                    isActive: c.isActive,
                    predictionCount: 0,
                    curve: c.curve,
                  }}
                  subtitle={`${c.componentTypeName} on every ${c.assetTypeName.toLowerCase()} · ${formatNumber(
                    c.componentCount
                  )} component${c.componentCount === 1 ? "" : "s"} · typical life ${typical} yr`}
                  fallsBackTo={`${c.componentTypeName.toLowerCase()} forecasts on ${c.assetTypeName.toLowerCase()}s use the typical ${typical}-year curve instead`}
                  showGraph={open.has(c.id)}
                  onShowGraphChange={(show) => toggleGroup([c.id], show)}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
