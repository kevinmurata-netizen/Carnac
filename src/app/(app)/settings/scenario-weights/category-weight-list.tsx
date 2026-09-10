"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CircleDot, Plus, Star, Trash2 } from "lucide-react";
import {
  CATEGORY_KEYS,
  CATEGORY_DESCRIPTIONS,
  NEUTRAL_CATEGORY_WEIGHTS,
  UNCAPPED,
} from "@/domain/waterline/category-weight";
import type { TreatmentCategory } from "@/domain/waterline/treatment";
import type { CategoryWeightSetRow } from "@/server/category-weight-sets";
import { Feedback, EMPTY, firstSpoken, inputClass as input, type Action } from "./shared";

type Draft = {
  id: string;
  name: string;
  description: string;
  weights: Record<TreatmentCategory, number>;
  /** Whole percentages in the form; stored as fractions. */
  caps: Record<TreatmentCategory, number>;
};

const asPercent = (fraction: number) => Math.round(fraction * 100);

const BLANK: Draft = {
  id: "",
  name: "",
  description: "",
  weights: { ...NEUTRAL_CATEGORY_WEIGHTS },
  caps: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, asPercent(UNCAPPED[k])])) as Record<
    TreatmentCategory,
    number
  >,
};

function toDraft(set: CategoryWeightSetRow): Draft {
  return {
    id: set.id,
    name: set.name,
    description: set.description ?? "",
    weights: { ...set.weights },
    caps: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, asPercent(set.caps[k])])) as Record<
      TreatmentCategory,
      number
    >,
  };
}

/** "×1.6" reads as a multiplier; "1.6" on its own invites being read as a
 * percentage of something. */
const times = (v: number) => `×${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, "")}`;

export function CategoryWeightList({
  sets,
  canEdit,
  onSave,
  onSetDefault,
  onDelete,
}: {
  sets: CategoryWeightSetRow[];
  canEdit: boolean;
  onSave: Action;
  onSetDefault: Action;
  onDelete: Action;
}) {
  const [saveState, save] = useActionState(onSave, EMPTY);
  const [defaultState, makeDefault] = useActionState(onSetDefault, EMPTY);
  const [deleteState, remove] = useActionState(onDelete, EMPTY);

  const [editing, setEditing] = useState<Draft | null>(null);

  return (
    <div className="space-y-4">
      <Feedback state={firstSpoken(saveState, defaultState, deleteState)} />

      <Card>
        <CardHeader className="space-y-1">
          <div className="flex flex-row items-center justify-between">
            <CardTitle>
              Category Weight <span className="text-muted-foreground">({sets.length})</span>
            </CardTitle>
            {canEdit && (
              <Button
                type="button"
                size="sm"
                onClick={() => setEditing({ ...BLANK, weights: { ...BLANK.weights }, caps: { ...BLANK.caps } })}
              >
                <Plus className="mr-1 h-4 w-4" />
                New category weighting
              </Button>
            )}
          </div>
          <p className="text-sm font-normal text-muted-foreground">
            Two levers per category. The <span className="font-medium">weight</span> decides what ranks first — a
            multiplier, where 1 leaves a category exactly where its merits put it. The{" "}
            <span className="font-medium">budget cap</span> decides what actually gets paid for: the most of one
            year&apos;s budget that category may take. Ranking alone cannot stop a plan spending everything on cheap
            repairs, because cheap repairs genuinely do remove more risk per dollar — they just never renew anything.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {sets.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No category weightings yet. Without one every category counts the same, which is what the model did
              before this existed.
            </p>
          )}

          {sets.map((set) => {
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
                    {set.description && <p className="mt-0.5 text-xs text-muted-foreground">{set.description}</p>}

                    {/* Every category, always, including the ones left at 1 —
                        a list that showed only the adjusted ones would read as
                        if the rest were missing rather than deliberately
                        untouched. */}
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {CATEGORY_KEYS.map((k) => (
                        <span key={k} className={set.weights[k] === 1 ? "" : "font-medium text-foreground"}>
                          {k} {times(set.weights[k])}
                        </span>
                      ))}
                    </p>

                    {set.capped.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Budget caps</span>
                        {CATEGORY_KEYS.filter((k) => set.caps[k] < 1).map((k) => (
                          <span key={k}>
                            {k} ≤ {Math.round(set.caps[k] * 100)}%
                          </span>
                        ))}
                        <span>
                          {CATEGORY_KEYS.filter((k) => set.caps[k] >= 1).join(", ")} uncapped — they absorb what the
                          rest leave
                        </span>
                      </p>
                    )}

                    {set.excluded.length > 0 && (
                      <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
                        {set.excluded.join(", ")} {set.excluded.length === 1 ? "is" : "are"} at zero, so no{" "}
                        {set.excluded.length === 1 ? "treatment of that kind" : "treatments of those kinds"} can ever be
                        funded by a scenario using this.
                      </p>
                    )}
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
        <CategoryWeightEditor
          key={editing.id || "new"}
          draft={editing}
          action={save}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CategoryWeightEditor({
  draft,
  action,
  onClose,
}: {
  draft: Draft;
  action: (formData: FormData) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState(draft);
  const dirty = JSON.stringify(values) !== JSON.stringify(draft);
  const setWeight = (key: TreatmentCategory, v: number) =>
    setValues((prev) => ({ ...prev, weights: { ...prev.weights, [key]: v } }));
  const setCap = (key: TreatmentCategory, v: number) =>
    setValues((prev) => ({ ...prev, caps: { ...prev.caps, [key]: v } }));

  const capTotal = CATEGORY_KEYS.reduce((sum, k) => sum + values.caps[k], 0);
  const uncapped = CATEGORY_KEYS.filter((k) => values.caps[k] >= 100);
  const allCappedToZero = CATEGORY_KEYS.every((k) => values.caps[k] === 0);

  const allZero = CATEGORY_KEYS.every((k) => values.weights[k] === 0);
  const zeroed = CATEGORY_KEYS.filter((k) => values.weights[k] === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{draft.id ? `Edit ${draft.name}` : "New category weighting"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={values.id} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cw-name">Name</Label>
              <input
                id="cw-name"
                name="name"
                required
                placeholder="e.g. Renewal Push"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                className={input}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cw-description">Description</Label>
              <input
                id="cw-description"
                name="description"
                placeholder="When you would choose this weighting"
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                className={input}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {CATEGORY_KEYS.map((key) => (
              <div className="space-y-3 rounded-md border p-3" key={key}>
                <div>
                  <Label htmlFor={`cw-${key}`}>{key}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{CATEGORY_DESCRIPTIONS[key]}</p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`cw-${key}`} className="text-xs text-muted-foreground">
                    Weight
                  </Label>
                  <input
                    id={`cw-${key}`}
                    name={key}
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={values.weights[key]}
                    onChange={(e) => setWeight(key, Number(e.target.value))}
                    className={values.weights[key] === 0 ? `${input} border-amber-500` : input}
                  />
                  <p className="text-xs font-medium text-foreground">
                    {values.weights[key] === 0
                      ? "Never funded"
                      : values.weights[key] === 1
                        ? "Counts as it stands"
                        : values.weights[key] > 1
                          ? `Worth ${times(values.weights[key])} as much`
                          : `Worth ${times(values.weights[key])} — held back`}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`cw-${key}-cap`} className="text-xs text-muted-foreground">
                    Budget cap (% / year)
                  </Label>
                  <input
                    id={`cw-${key}-cap`}
                    name={`${key}Cap`}
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={values.caps[key]}
                    onChange={(e) => setCap(key, Number(e.target.value))}
                    className={values.caps[key] < 100 ? `${input} border-primary/60` : input}
                  />
                  <p className="text-xs font-medium text-foreground">
                    {values.caps[key] >= 100
                      ? "Uncapped — absorbs what the rest leave"
                      : values.caps[key] === 0
                        ? "Never funded, whatever it scores"
                        : `At most ${values.caps[key]}% of the year`}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {allCappedToZero ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Every category is capped at 0%, so a plan using this would fund nothing at all.
            </p>
          ) : (
            uncapped.length === 0 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-500">
                Every category is capped, and they add up to {capTotal}% of the year. Nothing absorbs what the others
                leave, so any shortfall simply goes unspent. Leaving one category — usually renewal — at 100% is what
                lets the rollover land somewhere.
              </p>
            )
          )}

          {allZero ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Every category is zero, so this weighting funds nothing at all. Leave at least one above zero.
            </p>
          ) : (
            zeroed.length > 0 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-500">
                {zeroed.join(", ")} {zeroed.length === 1 ? "is" : "are"} at zero. A scenario using this weighting can
                never fund that work, whatever its condition or risk says — which is a stronger statement than counting
                it less.
              </p>
            )
          )}

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            {dirty && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                <CircleDot className="h-3 w-3" />
                Unsaved changes
              </span>
            )}
            {dirty ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setValues(draft)}>
                Discard changes
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={allZero || allCappedToZero}>
              {draft.id ? "Save category weighting" : "Create category weighting"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
