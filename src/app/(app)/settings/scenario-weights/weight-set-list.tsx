"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, CircleDot, Plus, Star, Trash2 } from "lucide-react";
import { OBJECTIVE_LABELS, OBJECTIVE_DESCRIPTIONS, normalizeWeights } from "@/domain/waterline/optimization";
import type { WeightSetRow } from "@/server/weight-sets";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type State = { status: "idle" | "success" | "error"; message?: string };
const EMPTY: State = { status: "idle" };
type Action = (prev: State, form: FormData) => Promise<State>;

/** Whole numbers read better than fractions, and normalization makes the two
 * identical. Rounded because 0.3 × 100 is not always 30 in binary. */
const pct = (v: number) => Math.round(v * 1000) / 10;

const BLANK = {
  id: "",
  name: "",
  description: "",
  conditionImprovement: 30,
  riskReduction: 40,
  lifeCycleCost: 20,
  criticality: 10,
};

type Draft = typeof BLANK;

function toDraft(set: WeightSetRow): Draft {
  return {
    id: set.id,
    name: set.name,
    description: set.description ?? "",
    conditionImprovement: pct(set.weights.conditionImprovement),
    riskReduction: pct(set.weights.riskReduction),
    lifeCycleCost: pct(set.weights.lifeCycleCost),
    criticality: pct(set.weights.criticality),
  };
}

function Feedback({ state }: { state: State }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        error ? "border-destructive/40 bg-destructive/5" : "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
      }`}
    >
      {error ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      )}
      <span>{state.message}</span>
    </div>
  );
}

export function WeightSetList({
  sets,
  canEdit,
  onSave,
  onSetDefault,
  onDelete,
}: {
  sets: WeightSetRow[];
  canEdit: boolean;
  onSave: Action;
  onSetDefault: Action;
  onDelete: Action;
}) {
  const [saveState, save] = useActionState(onSave, EMPTY);
  const [defaultState, makeDefault] = useActionState(onSetDefault, EMPTY);
  const [deleteState, remove] = useActionState(onDelete, EMPTY);

  // Which set is open in the editor. Null means none; a blank draft means a new
  // one is being written.
  const [editing, setEditing] = useState<Draft | null>(null);

  return (
    <div className="space-y-4">
      <Feedback state={saveState.status !== "idle" ? saveState : defaultState.status !== "idle" ? defaultState : deleteState} />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            Weightings <span className="text-muted-foreground">({sets.length})</span>
          </CardTitle>
          {canEdit && (
            <Button type="button" size="sm" onClick={() => setEditing({ ...BLANK })}>
              <Plus className="mr-1 h-4 w-4" />
              New weighting
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {sets.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No weightings yet. Without one, ranking falls back to the built-in 30/40/20/10.
            </p>
          )}

          {sets.map((set) => {
            const n = normalizeWeights(set.weights);
            const used = set.scenarioCount + set.workPlanCount;
            return (
              <div key={set.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{set.name}</span>
                      {set.isDefault && (
                        <Badge variant="default">
                          <Star className="mr-1 h-3 w-3" />
                          Default
                        </Badge>
                      )}
                      {used > 0 && (
                        <span className="text-xs text-muted-foreground">
                          used by {set.scenarioCount} scenario{set.scenarioCount === 1 ? "" : "s"},{" "}
                          {set.workPlanCount} plan{set.workPlanCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    {set.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{set.description}</p>
                    )}
                    {/* The normalized split, because that is what actually
                        ranks — a set entered as 15/65/10/10 is not obviously
                        65% risk until it is shown that way. */}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Condition {pct(n.conditionImprovement)}% · Risk {pct(n.riskReduction)}% · Life-cycle{" "}
                      {pct(n.lifeCycleCost)}% · Criticality {pct(n.criticality)}%
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      {!set.isDefault && (
                        <form action={makeDefault}>
                          <input type="hidden" name="id" value={set.id} />
                          <Button type="submit" size="sm" variant="ghost" title="Use this when nothing is chosen">
                            <Star className="mr-1 h-3.5 w-3.5" />
                            Make default
                          </Button>
                        </form>
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(toDraft(set))}>
                        Edit
                      </Button>
                      <form action={remove}>
                        <input type="hidden" name="id" value={set.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${set.name}`}
                          title={
                            set.isDefault
                              ? "The default cannot be deleted — make another set the default first"
                              : used > 0
                                ? "Still used by a scenario or plan"
                                : `Delete ${set.name}`
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {editing && canEdit && (
        <WeightSetEditor
          key={editing.id || "new"}
          draft={editing}
          action={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function WeightSetEditor({
  draft,
  action,
  onClose,
}: {
  draft: Draft;
  action: (formData: FormData) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState(draft);
  const patch = (change: Partial<Draft>) => setValues((v) => ({ ...v, ...change }));
  const dirty = JSON.stringify(values) !== JSON.stringify(draft);

  const total =
    values.conditionImprovement + values.riskReduction + values.lifeCycleCost + values.criticality;

  const field = (key: keyof typeof OBJECTIVE_LABELS) => (
    <div className="space-y-1.5" key={key}>
      <Label htmlFor={key}>{OBJECTIVE_LABELS[key]}</Label>
      <input
        id={key}
        name={key}
        type="number"
        min={0}
        max={100}
        step={1}
        value={values[key as keyof Draft] as number}
        onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<Draft>)}
        className={input}
      />
      <p className="text-xs text-muted-foreground">{OBJECTIVE_DESCRIPTIONS[key]}</p>
      <p className="text-xs font-medium text-foreground">
        {total > 0 ? `${Math.round(((values[key as keyof Draft] as number) / total) * 1000) / 10}% of the ranking` : "—"}
      </p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{draft.id ? `Edit ${draft.name}` : "New weighting"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={values.id} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <input
                id="name"
                name="name"
                required
                placeholder="e.g. Risk First"
                value={values.name}
                onChange={(e) => patch({ name: e.target.value })}
                className={input}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <input
                id="description"
                name="description"
                placeholder="When you would choose this weighting"
                value={values.description}
                onChange={(e) => patch({ description: e.target.value })}
                className={input}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {field("conditionImprovement")}
            {field("riskReduction")}
            {field("lifeCycleCost")}
            {field("criticality")}
          </div>

          {total <= 0 && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Every weight is zero, so this set says nothing. Ranking would fall back to the built-in defaults rather
              than to what this says.
            </p>
          )}

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            {dirty && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                <CircleDot className="h-3 w-3" />
                Unsaved changes
              </span>
            )}
            {/* Closing the editor is the local "back" here — the list is still
                on screen behind it, so leaving the page would overshoot. */}
            {dirty ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setValues(draft)}>
                Discard changes
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={total <= 0}>
              {draft.id ? "Save weighting" : "Create weighting"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
