"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { AlertTriangle, CheckCircle2, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  BASE_YEAR_MAX,
  BASE_YEAR_MIN,
  PERIOD_MAX,
  PERIOD_MIN,
  SCENARIO_SET_STATUSES,
  STATUS_LABELS,
  endYear,
  type ScenarioSetStatusValue,
} from "@/lib/scenario-sets";
import type { SetFormState } from "./actions";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type SetFormValues = {
  id: string;
  name: string;
  description: string;
  baseYear: string;
  planningPeriodYears: string;
  status: ScenarioSetStatusValue;
};

/**
 * Creating or editing a scenario set.
 *
 * The window line under the two year fields is the reason this is a client
 * component: "2027 for 20 years" is two numbers someone has to add up, and
 * "2027–2046" is the thing they actually meant. When the set already has
 * scenarios, it also says that changing the window leaves their results
 * describing the old one — which is true, and easy not to think of.
 */
export function ScenarioSetForm({
  initial,
  action,
  memberCount = 0,
  onCancelHref,
  onCancel,
}: {
  initial: SetFormValues;
  action: (prev: SetFormState, formData: FormData) => Promise<SetFormState>;
  /** Members whose results a window change would put out of step. */
  memberCount?: number;
  onCancelHref?: string;
  onCancel?: () => void;
}) {
  const [state, formAction] = useActionState(action, { status: "idle" } as SetFormState);
  const [values, setValues] = useState(initial);
  const patch = (change: Partial<SetFormValues>) => setValues((v) => ({ ...v, ...change }));

  const isEdit = initial.id !== "";
  const changed = (k: keyof SetFormValues) => isEdit && values[k] !== initial[k];
  const mark = (k: keyof SetFormValues) => (changed(k) ? `${input} border-amber-500` : input);
  const dirty = (Object.keys(values) as Array<keyof SetFormValues>).some(changed);

  const base = Number(values.baseYear);
  const period = Number(values.planningPeriodYears);
  const windowValid =
    Number.isInteger(base) &&
    Number.isInteger(period) &&
    base >= BASE_YEAR_MIN &&
    base <= BASE_YEAR_MAX &&
    period >= PERIOD_MIN &&
    period <= PERIOD_MAX;
  const windowChanged = changed("baseYear") || changed("planningPeriodYears");
  // Matches the server, which ages from the year a run happens in.
  const thisYear = new Date().getFullYear();

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={values.id} />

      {state.status !== "idle" && state.message && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
            state.status === "error"
              ? "border-destructive/40 bg-destructive/5"
              : "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
          }`}
        >
          {state.status === "error" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <span>{state.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="set-name">Name</Label>
          <input
            id="set-name"
            name="name"
            required
            placeholder="e.g. 2027 Capital Plan"
            value={values.name}
            onChange={(e) => patch({ name: e.target.value })}
            className={mark("name")}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="set-status">Status</Label>
          <select
            id="set-status"
            name="status"
            value={values.status}
            onChange={(e) => patch({ status: e.target.value as ScenarioSetStatusValue })}
            className={mark("status")}
          >
            {SCENARIO_SET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
          <Label htmlFor="set-description">Description</Label>
          <textarea
            id="set-description"
            name="description"
            rows={2}
            placeholder="What this set of scenarios is meant to decide"
            value={values.description}
            onChange={(e) => patch({ description: e.target.value })}
            className={`${mark("description")} h-auto py-2`}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="set-baseYear">Base year</Label>
          <input
            id="set-baseYear"
            name="baseYear"
            type="number"
            required
            min={BASE_YEAR_MIN}
            max={BASE_YEAR_MAX}
            step={1}
            value={values.baseYear}
            onChange={(e) => patch({ baseYear: e.target.value })}
            className={mark("baseYear")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="set-period">Planning period (yr)</Label>
          <input
            id="set-period"
            name="planningPeriodYears"
            type="number"
            required
            min={PERIOD_MIN}
            max={PERIOD_MAX}
            step={1}
            value={values.planningPeriodYears}
            onChange={(e) => patch({ planningPeriodYears: e.target.value })}
            className={mark("planningPeriodYears")}
          />
        </div>
        <div className="flex items-end pb-2 text-sm sm:col-span-2">
          {windowValid ? (
            <p className="text-muted-foreground">
              Every scenario in this set runs{" "}
              <span className="font-medium text-foreground tabular-nums">
                {base}–{endYear({ baseYear: base, planningPeriodYears: period })}
              </span>

              {base > thisYear ? (
                <>
                  . The network is first aged {base - thisYear} year{base - thisYear === 1 ? "" : "s"} from its{" "}
                  {thisYear} condition, with no work in between.
                </>
              ) : base < thisYear ? (
                // Said, because it is the one case the years do not mean what
                // they say: a pipe cannot be un-aged, so an earlier base year
                // relabels today's network rather than recreating that year's.
                <>, starting from the network as it is now — condition cannot be wound back to {base}.</>
              ) : (
                <>, from the network&apos;s latest measured condition.</>
              )}
            </p>
          ) : (
            <p className="text-muted-foreground">
              Base year {BASE_YEAR_MIN}–{BASE_YEAR_MAX}, period {PERIOD_MIN}–{PERIOD_MAX} years.
            </p>
          )}
        </div>
      </div>

      {windowChanged && memberCount > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
          {memberCount === 1 ? "The scenario" : `All ${memberCount} scenarios`} in this set will keep{" "}
          {memberCount === 1 ? "its" : "their"} current results until run again, and those results cover the old
          years. Saving does not run anything — use Run all scenarios afterwards.
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        {dirty && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
            <CircleDot className="h-3 w-3" />
            Unsaved changes
          </span>
        )}
        {onCancel ? (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : onCancelHref ? (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={onCancelHref}>Cancel</Link>} />
        ) : null}
        <Submit label={isEdit ? "Save set" : "Create set"} disabled={isEdit && !dirty} />
      </div>
    </form>
  );
}

function Submit({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || disabled}>
      {pending ? "Saving…" : label}
    </Button>
  );
}
