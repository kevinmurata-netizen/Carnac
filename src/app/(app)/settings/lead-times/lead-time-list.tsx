"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { AlertTriangle, CheckCircle2, CircleDot, Copy, Plus, Star, Trash2 } from "lucide-react";
import { CATEGORY_KEYS, CATEGORY_DESCRIPTIONS } from "@/domain/waterline/category-weight";
import { describeLeadTime, MAX_OFFSET, type CashInstalment, type LeadTime } from "@/domain/waterline/lead-time";
import type { TreatmentCategory } from "@/domain/waterline/treatment";
import type { LeadTimeSetRow } from "@/server/lead-times";

const input =
  "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type State = { status: "idle" | "success" | "error"; message?: string };
const EMPTY: State = { status: "idle" };
type Action = (prev: State, form: FormData) => Promise<State>;

export type TreatmentChoice = { id: string; name: string; category: TreatmentCategory };

type Override = { treatmentId: string; lead: LeadTime };
type Draft = {
  id: string;
  name: string;
  description: string;
  byCategory: Record<TreatmentCategory, LeadTime>;
  overrides: Override[];
};

const NOW: LeadTime = { fundOffset: 0, buildOffset: 0, cash: [] };

const BLANK: Draft = {
  id: "",
  name: "",
  description: "",
  byCategory: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, { ...NOW }])) as Record<TreatmentCategory, LeadTime>,
  overrides: [],
};

function toDraft(set: LeadTimeSetRow, treatments: TreatmentChoice[]): Draft {
  return {
    id: set.id,
    name: set.name,
    description: set.description ?? "",
    byCategory: set.byCategory,
    overrides: set.overrides.map((o) => ({
      treatmentId: treatments.find((t) => t.name === o.treatmentName)?.id ?? o.treatmentId,
      lead: o.lead,
    })),
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

export function LeadTimeList({
  sets,
  treatments,
  thisYear,
  canEdit,
  onSave,
  onSetDefault,
  onCopy,
  onDelete,
}: {
  sets: LeadTimeSetRow[];
  treatments: TreatmentChoice[];
  thisYear: number;
  canEdit: boolean;
  onSave: Action;
  onSetDefault: Action;
  onCopy: Action;
  onDelete: Action;
}) {
  const [defaultState, makeDefault] = useActionState(onSetDefault, EMPTY);
  const [copyState, copy] = useActionState(onCopy, EMPTY);
  const [deleteState, remove] = useActionState(onDelete, EMPTY);
  const [editing, setEditing] = useState<Draft | null>(null);

  // Saving is driven by hand rather than through useActionState, so that a
  // save which worked can close the editor in the same breath. Leaving the
  // form open with what was just saved still in it read as "nothing
  // happened", which is exactly what it was not.
  const [saveState, setSaveState] = useState<State>(EMPTY);
  const [saving, startSaving] = useTransition();
  const save = (formData: FormData) =>
    startSaving(async () => {
      const result = await onSave(EMPTY, formData);
      setSaveState(result);
      if (result.status === "success") setEditing(null);
    });

  const spoken = [saveState, defaultState, copyState, deleteState].find((s) => s.status !== "idle") ?? EMPTY;

  return (
    <div className="space-y-4">
      <Feedback state={spoken} />

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            Lead times <span className="text-muted-foreground">({sets.length})</span>
          </CardTitle>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setEditing({
                  ...BLANK,
                  byCategory: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, { ...NOW }])) as Draft["byCategory"],
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              New lead times
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {sets.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              None yet, so work is decided, paid for and built in the same year — how every scenario has run so far.
            </p>
          )}

          {sets.map((set) => (
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
                    {set.immediate && <Badge variant="outline">no delay</Badge>}
                  </div>
                  {set.description && <p className="mt-0.5 text-xs text-muted-foreground">{set.description}</p>}

                  <ul className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    {CATEGORY_KEYS.map((category) => (
                      <li key={category} className="rounded border px-1.5 py-0.5">
                        {category} <span className="tabular-nums">{describeLeadTime(set.byCategory[category])}</span>
                      </li>
                    ))}
                  </ul>

                  {set.overrides.length > 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {set.overrides.length} exception{set.overrides.length === 1 ? "" : "s"}:{" "}
                      {set.overrides.map((o) => `${o.treatmentName} ${describeLeadTime(o.lead)}`).join("; ")}
                    </p>
                  )}

                  {set.longestBuild > 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      The slowest work takes {set.longestBuild} year{set.longestBuild === 1 ? "" : "s"} to build, so
                      nothing but faster work can improve the network before then.
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
                    <form action={copy}>
                      <input type="hidden" name="id" value={set.id} />
                      <Button type="submit" size="sm" variant="ghost" title={`Copy ${set.name}`}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing(toDraft(set, treatments))}>
                      Edit
                    </Button>
                    <form action={remove}>
                      <input type="hidden" name="id" value={set.id} />
                      <ConfirmDelete
                        variant="ghost"
                        ariaLabel={`Delete ${set.name}`}
                        title={`Delete the lead times “${set.name}”?`}
                        description={
                          set.isDefault
                            ? "They are the default, so deletion will be refused. Make another set the default, or clear the default, first."
                            : "The set and its exceptions are deleted. This cannot be undone."
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </ConfirmDelete>
                    </form>
                  </div>
                )}
              </div>
            </div>
          ))}

          {sets.some((s) => s.isDefault) && canEdit && (
            <form action={makeDefault} className="pt-1">
              <input type="hidden" name="id" value="" />
              <Button type="submit" size="sm" variant="ghost">
                Clear the default — go back to everything in the year it is decided
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* A dialog rather than a panel below the list, like the treatment and
          rule editors: it opens over the list, and saving closes it, so the
          list is what is on screen when the work is done. */}
      {canEdit && (
        <EditorDialog
          open={editing != null}
          onClose={() => setEditing(null)}
          title={editing?.id ? `Edit ${editing.name}` : "New lead times"}
          description="How many years after the work is decided its money leaves the budget, and how many more before it is built and the network improves. Both counted from the year a scenario programs the work — 0 and 0 is what every scenario has always done."
        >
          {editing && (
            <LeadTimeEditor
              key={editing.id || "new"}
              draft={editing}
              treatments={treatments}
              thisYear={thisYear}
              action={save}
              saving={saving}
              onClose={() => setEditing(null)}
            />
          )}
        </EditorDialog>
      )}
    </div>
  );
}

function LeadTimeEditor({
  draft,
  treatments,
  thisYear,
  action,
  saving,
  onClose,
}: {
  draft: Draft;
  treatments: TreatmentChoice[];
  thisYear: number;
  action: (formData: FormData) => void;
  saving: boolean;
  onClose: () => void;
}) {
  const [values, setValues] = useState(draft);
  const [splitting, setSplitting] = useState<TreatmentCategory | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(draft);

  const setLead = (category: TreatmentCategory, change: Partial<LeadTime>) =>
    setValues((v) => ({ ...v, byCategory: { ...v.byCategory, [category]: { ...v.byCategory[category], ...change } } }));

  const setOverride = (index: number, change: Partial<LeadTime>) =>
    setValues((v) => ({
      ...v,
      overrides: v.overrides.map((o, i) => (i === index ? { ...o, lead: { ...o.lead, ...change } } : o)),
    }));

  const problems: string[] = [];
  for (const category of CATEGORY_KEYS) {
    const lead = values.byCategory[category];
    if (lead.fundOffset > lead.buildOffset) problems.push(`${category} is funded after it is built.`);
    const total = lead.cash.reduce((sum, i) => sum + i.percent, 0);
    if (lead.cash.length > 0 && Math.abs(total - 100) > 0.01) {
      problems.push(`${category}'s payments come to ${Math.round(total)}% rather than 100%.`);
    }
    if (lead.cash.some((i) => i.offset > lead.buildOffset)) {
      problems.push(`${category} has a payment after the work is built.`);
    }
  }
  if (values.overrides.some((o) => !o.treatmentId)) problems.push("An exception has no treatment chosen.");
  // The name is a problem like any other rather than a silently disabled
  // button: not being able to save, with nothing saying why, is the thing
  // this list exists to prevent.
  if (!values.name.trim()) problems.push("The lead times need a name.");

  const unused = treatments.filter((t) => !values.overrides.some((o) => o.treatmentId === t.id));

  return (
    <>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={values.id} />
          <input
            type="hidden"
            name="lead"
            value={JSON.stringify({ byCategory: values.byCategory, overrides: values.overrides })}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lt-name">
                Name <span className="text-destructive">*</span>
                <span className="ml-1 font-normal text-muted-foreground">required</span>
              </Label>
              <input
                id="lt-name"
                name="name"
                required
                aria-required
                placeholder="e.g. Typical delivery"
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                className={`${input} w-full`}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lt-description">Description</Label>
              <input
                id="lt-description"
                name="description"
                placeholder="When you would choose this set"
                value={values.description}
                onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                className={`${input} w-full`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Years from the decision</Label>
            <ul className="space-y-2">
              {CATEGORY_KEYS.map((category) => {
                const lead = values.byCategory[category];
                return (
                  <li key={category} className="rounded-md border bg-background p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{category}</span>
                        <span className="block text-xs text-muted-foreground">{CATEGORY_DESCRIPTIONS[category]}</span>
                      </span>

                      <Offsets
                        idPrefix={category}
                        lead={lead}
                        onChange={(change) => setLead(category, change)}
                        disabled={lead.cash.length > 0}
                      />

                      <Button
                        type="button"
                        size="sm"
                        variant={lead.cash.length > 0 ? "default" : "outline"}
                        onClick={() => setSplitting((s) => (s === category ? null : category))}
                      >
                        {lead.cash.length > 0 ? `Paid over ${lead.cash.length} years` : "Split the payments"}
                      </Button>
                    </div>

                    {splitting === category && (
                      <SplitEditor
                        lead={lead}
                        onChange={(cash) => setLead(category, { cash })}
                        onClose={() => setSplitting(null)}
                      />
                    )}

                    <p className="mt-2 text-xs text-muted-foreground">
                      Decided in {thisYear}:{" "}
                      {lead.cash.length > 0
                        ? lead.cash
                            .map((i) => `${Math.round(i.percent)}% in ${thisYear + i.offset}`)
                            .join(", ")
                        : `paid in ${thisYear + lead.fundOffset}`}
                      , built in {thisYear + lead.buildOffset}.
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* The exception, not the rule: a utility thinks in categories, and a
              row per treatment would bury the two that actually differ. */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Treatments that differ from their category</Label>
              {unused.length > 0 && (
                <select
                  aria-label="Add a treatment exception"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    const treatment = treatments.find((t) => t.id === id)!;
                    setValues((v) => ({
                      ...v,
                      overrides: [...v.overrides, { treatmentId: id, lead: { ...v.byCategory[treatment.category] } }],
                    }));
                  }}
                  className={`${input} w-56`}
                >
                  <option value="">Add an exception…</option>
                  {unused.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.category})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {values.overrides.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
                None. Every treatment takes as long as its category says.
              </p>
            ) : (
              <ul className="space-y-2">
                {values.overrides.map((override, index) => {
                  const treatment = treatments.find((t) => t.id === override.treatmentId);
                  return (
                    <li
                      key={override.treatmentId || index}
                      className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{treatment?.name ?? "That treatment"}</span>
                        <span className="block text-xs text-muted-foreground">
                          {treatment
                            ? `${treatment.category} says ${describeLeadTime(values.byCategory[treatment.category])}`
                            : "No longer in the library"}
                        </span>
                      </span>

                      <Offsets
                        idPrefix={`o-${index}`}
                        lead={override.lead}
                        onChange={(change) => setOverride(index, change)}
                      />

                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove the exception for ${treatment?.name ?? "that treatment"}`}
                        onClick={() =>
                          setValues((v) => ({ ...v, overrides: v.overrides.filter((_, i) => i !== index) }))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* What is stopping the save, where the save is — a disabled button
              with the reason elsewhere, or nowhere, is how someone ends up
              hunting for a missing name. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="min-w-0 flex-1 text-sm">
              {problems.length > 0 ? (
                <ul className="space-y-0.5 text-destructive">
                  {problems.map((p) => (
                    <li key={p} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              ) : (
                dirty && (
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                    <CircleDot className="h-3 w-3" />
                    Unsaved changes
                  </span>
                )
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {dirty && draft.id ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setValues(draft)}>
                  Discard changes
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={problems.length > 0 || saving}
                title={problems.length > 0 ? problems.join(" ") : undefined}
              >
                {saving ? "Saving…" : draft.id ? "Save lead times" : "Create lead times"}
              </Button>
            </div>
          </div>
        </form>
    </>
  );
}

/** The two year boxes, shared by a category row and an exception row. */
function Offsets({
  idPrefix,
  lead,
  onChange,
  disabled,
}: {
  idPrefix: string;
  lead: LeadTime;
  onChange: (change: Partial<LeadTime>) => void;
  disabled?: boolean;
}) {
  return (
    <span className="flex shrink-0 items-center gap-3">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Funded +</span>
        <input
          id={`${idPrefix}-fund`}
          type="number"
          min={0}
          max={MAX_OFFSET}
          value={lead.fundOffset}
          disabled={disabled}
          onChange={(e) => onChange({ fundOffset: Number(e.target.value) })}
          aria-label="Years from the decision to the money leaving"
          className={`${input} w-16 disabled:opacity-50`}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Built +</span>
        <input
          id={`${idPrefix}-build`}
          type="number"
          min={0}
          max={MAX_OFFSET}
          value={lead.buildOffset}
          onChange={(e) => onChange({ buildOffset: Number(e.target.value) })}
          aria-label="Years from the decision to construction"
          className={`${input} w-16`}
        />
      </label>
    </span>
  );
}

/** A cost spread over years — design money early, construction money at award.
 * The exception that earns the extra shape, so it is off until asked for. */
function SplitEditor({
  lead,
  onChange,
  onClose,
}: {
  lead: LeadTime;
  onChange: (cash: CashInstalment[]) => void;
  onClose: () => void;
}) {
  const cash = lead.cash.length > 0 ? lead.cash : [{ offset: lead.fundOffset, percent: 100 }];
  const total = cash.reduce((sum, i) => sum + i.percent, 0);

  const set = (index: number, change: Partial<CashInstalment>) =>
    onChange(cash.map((i, n) => (n === index ? { ...i, ...change } : i)));

  return (
    <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Each payment is a share of the cost, in a year counted from the decision. They must come to 100%, and none may
        fall after the work is built.
      </p>
      <ul className="space-y-1.5">
        {cash.map((instalment, index) => (
          <li key={index} className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="number"
              min={0}
              max={100}
              value={instalment.percent}
              onChange={(e) => set(index, { percent: Number(e.target.value) })}
              aria-label="Share of the cost, percent"
              className={`${input} w-20`}
            />
            <span>% in year +</span>
            <input
              type="number"
              min={0}
              max={lead.buildOffset}
              value={instalment.offset}
              onChange={(e) => set(index, { offset: Number(e.target.value) })}
              aria-label="Years from the decision to this payment"
              className={`${input} w-16`}
            />
            <Button
              type="button"
              size="xs"
              variant="ghost"
              aria-label="Remove this payment"
              onClick={() => onChange(cash.filter((_, n) => n !== index))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => onChange([...cash, { offset: lead.buildOffset, percent: Math.max(0, 100 - total) }])}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add a payment
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => onChange([])}>
          Pay it all in one year
        </Button>
        <span className={`text-xs ${Math.abs(total - 100) > 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
          {Math.round(total)}% of the cost
        </span>
        <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
