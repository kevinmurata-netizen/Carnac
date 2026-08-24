"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { MarkovConfig } from "@/server/settings";
import { saveMarkovModelAction, toggleDeteriorationActiveAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { SaveBar } from "../save-bar";
import { ActiveToggle } from "@/components/settings/active-toggle";
import { formatNumber } from "@/lib/format";
import { RotateCcw } from "lucide-react";

const cell =
  "h-8 w-full rounded border border-input bg-background px-1.5 text-center text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A Markov model has no deterioration curve — it holds the probability of
 * moving between condition states each year. It used to be rendered with the
 * curve editor, which invented a default curve, plotted it, and accepted edits
 * to parameters nothing read. This shows what the model actually contains.
 */
export function MarkovEditor({ config }: { config: MarkovConfig }) {
  const [state, action] = useActionState(saveMarkovModelAction, EMPTY_SETTINGS_STATE);
  const [matrix, setMatrix] = useState<number[][]>(config.matrix);

  const set = (row: number, col: number, value: number) =>
    setMatrix((prev) => prev.map((r, i) => (i === row ? r.map((c, j) => (j === col ? value : c)) : r)));

  const rowSums = matrix.map((r) => r.reduce((s, n) => s + n, 0));
  const changed = JSON.stringify(matrix) !== JSON.stringify(config.matrix);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={config.id} />
      <input type="hidden" name="matrix" value={JSON.stringify(matrix)} />
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base">{config.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              State-transition model · {formatNumber(config.predictionCount)} predictions · no curve — this one works
              in probabilities, not service life
            </p>
          </div>
          <ActiveToggle
            id={config.id}
            isActive={config.isActive}
            action={toggleDeteriorationActiveAction}
            activeHint="Click to deactivate — the network forecast falls back to the seeded transition matrix"
            inactiveHint="Click to activate — this matrix drives the network forecast again"
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5 sm:max-w-md">
            <Label htmlFor={`mk-name-${config.id}`}>Name</Label>
            <input
              id={`mk-name-${config.id}`}
              name="name"
              defaultValue={config.name}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">Transition Matrix</span>
              {changed && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setMatrix(config.matrix)}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Revert
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-muted-foreground">From \ To</th>
                    {config.states.map((s) => (
                      <th key={s} className="px-1 py-1 font-medium text-muted-foreground">
                        {s}
                      </th>
                    ))}
                    <th className="px-2 py-1 font-medium text-muted-foreground">Sum</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row, i) => {
                    const ok = Math.abs(rowSums[i] - 1) <= 0.005;
                    return (
                      <tr key={config.states[i] ?? i}>
                        <td className="whitespace-nowrap px-2 py-1 font-medium text-foreground">
                          {config.states[i] ?? `State ${i + 1}`}
                        </td>
                        {row.map((v, j) => (
                          <td key={j} className="px-1 py-1">
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.01}
                              value={v}
                              onChange={(e) => set(i, j, Number(e.target.value))}
                              className={`${cell} w-16 ${i === j ? "font-medium" : ""}`}
                              aria-label={`${config.states[i]} to ${config.states[j]}`}
                            />
                          </td>
                        ))}
                        <td
                          className={`px-2 py-1 text-center tabular-nums ${
                            ok ? "text-muted-foreground" : "font-medium text-destructive"
                          }`}
                        >
                          {rowSums[i].toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Each row is the chance a segment in that condition moves to each other condition over one year, so a row
            has to sum to 1 — it covers every outcome. The diagonal is the chance of staying put. Rows that do not sum
            to 1 leak or invent assets on every step, so saving is refused rather than letting the forecast drift for
            reasons no one could trace.
          </p>

          <SaveBar
            state={state}
            label="Save matrix"
            hint="Drives the Markov line on the Deterioration Models forecast."
          />
        </CardContent>
      </Card>
    </form>
  );
}
