"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DeteriorationModelConfig } from "@/server/settings";
import { DeteriorationModelEditor } from "./editor";
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
export function DeteriorationModelList({ models }: { models: DeteriorationModelConfig[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const allOpen = models.length > 0 && open.size === models.length;

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
            ? `${models.length} models`
            : `${open.size} of ${models.length} curves shown`}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(allOpen ? new Set() : new Set(models.map((m) => m.id)))}
        >
          <LineChart className="mr-1 h-3.5 w-3.5" />
          {allOpen ? "Hide all curves" : "Show all curves"}
        </Button>
      </div>

      <div className="space-y-4">
        {models.map((m) => (
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
    </>
  );
}
