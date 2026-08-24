"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DeteriorationModelConfig, MarkovConfig } from "@/server/settings";
import { DeteriorationModelEditor } from "./editor";
import { MarkovEditor } from "./markov-editor";
import { LineChart } from "lucide-react";

/**
 * Owns which curves are open, so one button can toggle them all.
 *
 * The state lives here rather than in each editor for two reasons: a master
 * toggle needs a single source of truth, and the page is a Server Component,
 * which cannot hand a callback to a client child.
 *
 * Keeping it here also means a curve stays open across a save — the editors are
 * keyed on their saved values and remount when one lands.
 */
export function DeteriorationModelList({
  models,
  markov,
}: {
  models: DeteriorationModelConfig[];
  /** Rendered separately: it has a transition matrix, not a curve. */
  markov: MarkovConfig | null;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  // A Markov model has no curve to show, so it is excluded from the toggle
  // counts as well as from the curve list.
  const curveModels = models.filter((m) => m.modelType !== "MARKOV");

  const allOpen = curveModels.length > 0 && open.size === curveModels.length;

  const setOne = (id: string, next: boolean) =>
    setOpen((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(id);
      else updated.delete(id);
      return updated;
    });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {open.size === 0
            ? `${curveModels.length} models`
            : `${open.size} of ${curveModels.length} curves shown`}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(allOpen ? new Set() : new Set(curveModels.map((m) => m.id)))}
        >
          <LineChart className="mr-1 h-3.5 w-3.5" />
          {allOpen ? "Hide all curves" : "Show all curves"}
        </Button>
      </div>

      <div className="space-y-4">
        {curveModels.map((m) => (
          // Keyed on the saved values, not just the id: the editor holds the
          // in-progress curve in state, and React would keep that state across
          // a save — leaving it marked "Unsaved" against values it just wrote.
          <DeteriorationModelEditor
            key={[
              m.id,
              m.name,
              m.isActive,
              m.curve.serviceLife,
              m.curve.shape,
              m.curve.initialCondition,
              m.curve.minCondition,
            ].join("|")}
            model={m}
            showGraph={open.has(m.id)}
            onShowGraphChange={(next) => setOne(m.id, next)}
          />
        ))}
      </div>

      {markov && (
        <div className="mt-4">
          <MarkovEditor config={markov} />
        </div>
      )}
    </>
  );
}
