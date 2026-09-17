"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { AlertTriangle, CheckCircle2, CircleDot, Plus, Star, Trash2 } from "lucide-react";
import { CATEGORY_KEYS, CATEGORY_DESCRIPTIONS } from "@/domain/waterline/category-weight";
import type { TreatmentCategory } from "@/domain/waterline/treatment";
import type { FundingPlanRow } from "@/server/category-funding";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type State = { status: "idle" | "success" | "error"; message?: string };
const EMPTY: State = { status: "idle" };
type Action = (prev: State, form: FormData) => Promise<State>;

type Step = { category: TreatmentCategory; pct: number };
type Draft = { id: string; name: string; description: string; steps: Step[] };

/** Every category, with no limit of its own. A starting point to lower. */
const BLANK: Draft = {
  id: "",
  name: "",
  description: "",
  steps: CATEGORY_KEYS.map((category) => ({ category, pct: 100 })),
};

function toDraft(plan: FundingPlanRow): Draft {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description ?? "",
    steps: plan.steps.map((s) => ({ category: s.category, pct: Math.round(s.maxPct * 100) })),
  };
}

function Feedback({ state }: { state: State }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        error
          ? "border-destructive/40 bg-destructive/5"
          : "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
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

export function FundingPlanList({
  plans,
  canEdit,
  onSave,
  onSetDefault,
  onDelete,
}: {
  plans: FundingPlanRow[];
  canEdit: boolean;
  onSave: Action;
  onSetDefault: Action;
  onDelete: Action;
}) {
  const [saveState, save] = useActionState(onSave, EMPTY);
  const [defaultState, makeDefault] = useActionState(onSetDefault, EMPTY);
  const [deleteState, remove] = useActionState(onDelete, EMPTY);
  const [editing, setEditing] = useState<Draft | null>(null);

  const spoken = [saveState, defaultState, deleteState].find((s) => s.status !== "idle") ?? EMPTY;

  return (
    <div className="space-y-4">
      <Feedback state={spoken} />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            Funding plans <span className="text-muted-foreground">({plans.length})</span>
          </CardTitle>
          {canEdit && (
            <Button type="button" size="sm" onClick={() => setEditing({ ...BLANK, steps: [...BLANK.steps] })}>
              <Plus className="mr-1 h-4 w-4" />
              New funding plan
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {plans.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No funding plans yet. Without one, a scenario is limited only by its yearly budget and category plays no
              part in what it buys.
            </p>
          )}

          {plans.map((plan) => {
            const used = plan.scenarioCount + plan.workPlanCount;
            return (
              <div key={plan.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{plan.name}</span>
                      {plan.isDefault && (
                        <Badge variant="default">
                          <Star className="mr-1 h-3 w-3" />
                          Default
                        </Badge>
                      )}
                      {used > 0 && (
                        <span className="text-xs text-muted-foreground">
                          used by {plan.scenarioCount} scenario{plan.scenarioCount === 1 ? "" : "s"},{" "}
                          {plan.workPlanCount} plan{plan.workPlanCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    {plan.description && <p className="mt-0.5 text-xs text-muted-foreground">{plan.description}</p>}

                    {/* Limits, not a sequence: shown as a set of chips. */}
                    <ul className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      {plan.steps.map((s) => (
                        <li key={s.category} className="flex items-center gap-1.5">
                          <span
                            className={`rounded border px-1.5 py-0.5 ${
                              s.maxPct === 0 ? "text-muted-foreground line-through" : "text-foreground"
                            }`}
                          >
                            {s.category} <span className="tabular-nums">{Math.round(s.maxPct * 100)}%</span>
                          </span>
                        </li>
                      ))}
                    </ul>

                    {plan.unfunded.length > 0 && (
                      <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
                        {plan.unfunded.join(", ")} {plan.unfunded.length === 1 ? "is" : "are"} never funded under this
                        plan.
                      </p>
                    )}
                    {plan.strands && (
                      <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
                        The shares total under 100% and nothing is uncapped, so part of every year goes unspent.
                      </p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      {!plan.isDefault && (
                        <form action={makeDefault}>
                          <input type="hidden" name="id" value={plan.id} />
                          <Button type="submit" size="sm" variant="ghost" title="Use this when nothing is chosen">
                            <Star className="mr-1 h-3.5 w-3.5" />
                            Make default
                          </Button>
                        </form>
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(toDraft(plan))}>
                        Edit
                      </Button>
                      <form action={remove}>
                        <input type="hidden" name="id" value={plan.id} />
                        <ConfirmDelete
                          variant="ghost"
                          ariaLabel={`Delete ${plan.name}`}
                          triggerTitle={used > 0 ? "Still used by a scenario or plan" : `Delete ${plan.name}`}
                          title={`Delete the funding plan “${plan.name}”?`}
                          description={
                            used > 0
                              ? "It is still used by a scenario or work plan, so deletion will be refused. Choose another plan on those first."
                              : "The plan and its category limits are deleted. This cannot be undone."
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </ConfirmDelete>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {plans.some((p) => p.isDefault) && canEdit && (
            <form action={makeDefault} className="pt-1">
              <input type="hidden" name="id" value="" />
              <Button type="submit" size="sm" variant="ghost">
                Clear the default — go back to no category limits
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {editing && canEdit && (
        <FundingPlanEditor key={editing.id || "new"} draft={editing} action={save} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function FundingPlanEditor({
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

  const setPct = (index: number, pct: number) =>
    setValues((v) => ({ ...v, steps: v.steps.map((s, i) => (i === index ? { ...s, pct } : s)) }));

  const removeStep = (index: number) =>
    setValues((v) => ({ ...v, steps: v.steps.filter((_, i) => i !== index) }));

  const missing = CATEGORY_KEYS.filter((c) => !values.steps.some((s) => s.category === c));
  const addStep = (category: TreatmentCategory) =>
    setValues((v) => ({ ...v, steps: [...v.steps, { category, pct: 100 }] }));

  const total = values.steps.reduce((sum, s) => sum + s.pct, 0);
  const allZero = values.steps.length > 0 && values.steps.every((s) => s.pct === 0);
  const strands = total < 100 && values.steps.length > 0 && values.steps.every((s) => s.pct < 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{draft.id ? `Edit ${draft.name}` : "New funding plan"}</CardTitle>
        <p className="text-sm font-normal text-muted-foreground">
          The most of each year&apos;s budget each category may take. The year&apos;s work is chosen across all categories
          at once — each step up judged by what it adds for its extra cost — and a category stops being funded when
          it reaches its share. A category left out is never funded.
        </p>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={values.id} />
          {/* The limits are posted as one JSON field, parsed and validated on
              the server like the rest of the plan. */}
          <input
            type="hidden"
            name="steps"
            value={JSON.stringify(values.steps.map((s) => ({ category: s.category, maxPct: s.pct / 100 })))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="fp-name">Name</Label>
              <input
                id="fp-name"
                name="name"
                required
                placeholder="e.g. Renewal capped at a fifth"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                className={input}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fp-description">Description</Label>
              <input
                id="fp-description"
                name="description"
                placeholder="When you would choose this plan"
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                className={input}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Limit per category</Label>
              <span className="text-xs text-muted-foreground">100% means no limit of its own</span>
            </div>

            {values.steps.length === 0 && (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No categories yet. Add at least one — a plan with none funds nothing.
              </p>
            )}

            <ul className="space-y-2">
              {values.steps.map((step, index) => (
                <li
                  key={step.category}
                  className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{step.category}</span>
                    <span className="block text-xs text-muted-foreground">{CATEGORY_DESCRIPTIONS[step.category]}</span>
                  </span>

                  <span className="flex shrink-0 items-center gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="sr-only">{step.category} share of the annual budget</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={step.pct}
                        onChange={(e) => setPct(index, Number(e.target.value))}
                        aria-label={`${step.category} share of the annual budget, percent`}
                        className={`${input} w-20`}
                      />
                      % / yr
                    </label>
                  </span>

                  <span className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${step.category}`}
                      title={`${step.category} would never be funded under this plan`}
                      onClick={() => removeStep(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>

            {missing.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">Not funded:</span>
                {missing.map((category) => (
                  <Button
                    key={category}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => addStep(category)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {category}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {allZero ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Every category is at 0%, so a scenario using this plan would fund nothing at all.
            </p>
          ) : (
            strands && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-500">
                The shares total {total}% and none is 100%, so at least {100 - total}% of every year cannot be spent by
                anything. Leaving at least one category at 100% lets it use what the others do not.
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
            <Button type="submit" size="sm" disabled={allZero || values.steps.length === 0}>
              {draft.id ? "Save funding plan" : "Create funding plan"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
