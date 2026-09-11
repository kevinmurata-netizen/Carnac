"use client";

import { Label } from "@/components/ui/label";
import type { TreatmentAdminRow } from "@/server/treatment-config";
import { DEFAULT_RETREATMENT_INTERVAL_YEARS } from "@/domain/waterline/retreatment";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { TreatmentActionState } from "./state";

/**
 * The fields that describe a treatment, shared by the page that creates one
 * and the page that edits one.
 *
 * They are shared rather than copied because the two pages must stay the same
 * shape: a field added to creation but not to editing would be unreachable
 * afterwards, and a field worded differently in the two places reads as two
 * different settings.
 *
 * Every field is controlled. React resets a form once its action returns, so
 * left uncontrolled these boxes would empty themselves the moment a create was
 * refused — losing everything typed exactly when the page is asking for it to
 * be typed again. Holding the values also lets a section say whether it has
 * unsaved edits.
 */

export const input =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const CATEGORIES = ["Assess", "Repair", "Rehabilitate", "Renew", "Retire"] as const;

/** Numbers are held as strings so an emptied box stays empty rather than
 * snapping back to zero under the cursor. */
export type TreatmentDraft = {
  name: string;
  category: string;
  usefulLife: string;
  retreatmentIntervalYears: string;
  description: string;
  implementationConstraints: string;
  effectMode: "reset" | "gain";
  effectValue: string;
  failureProbMultiplier: string;
  expectedLifeExtension: string;
};

const str = (value: number | null | undefined) => (value == null ? "" : String(value));

export function draftFromTreatment(treatment?: TreatmentAdminRow): TreatmentDraft {
  return {
    name: treatment?.name ?? "",
    category: treatment?.category ?? "Repair",
    usefulLife: str(treatment?.usefulLife ?? 0),
    // Blank rather than the default's number, so the box shows that nothing
    // has been decided rather than implying someone chose five.
    retreatmentIntervalYears:
      treatment?.retreatmentIntervalYears == null ? "" : str(treatment.retreatmentIntervalYears),
    description: treatment?.description ?? "",
    implementationConstraints: treatment?.implementationConstraints ?? "",
    effectMode: treatment?.conditionResetTo != null ? "reset" : "gain",
    effectValue: str(treatment?.conditionResetTo ?? treatment?.conditionGain),
    failureProbMultiplier: str(treatment?.failureProbMultiplier ?? 1),
    expectedLifeExtension: str(treatment?.expectedLifeExtension ?? 0),
  };
}

export type FieldProps = {
  draft: TreatmentDraft;
  onChange: (patch: Partial<TreatmentDraft>) => void;
};

export function Feedback({ state }: { state: TreatmentActionState }) {
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

/** Name, category, life, description and the free-text note. */
export function DefinitionFields({ draft, onChange }: FieldProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name">Name</Label>
          <input
            id="name"
            name="name"
            required
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={input}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <select
            id="category"
            name="category"
            value={draft.category}
            onChange={(e) => onChange({ category: e.target.value })}
            className={input}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="usefulLife">Useful Life (yr)</Label>
          <input
            id="usefulLife"
            name="usefulLife"
            type="number"
            min={0}
            value={draft.usefulLife}
            onChange={(e) => onChange({ usefulLife: e.target.value })}
            className={input}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="retreatmentIntervalYears">Repeat no sooner than (yr)</Label>
          <input
            id="retreatmentIntervalYears"
            name="retreatmentIntervalYears"
            type="number"
            min={0}
            placeholder={String(DEFAULT_RETREATMENT_INTERVAL_YEARS)}
            value={draft.retreatmentIntervalYears}
            onChange={(e) => onChange({ retreatmentIntervalYears: e.target.value })}
            className={input}
          />
          <p className="text-xs text-muted-foreground">
            A backstop, not the mechanism. What should really stop this being bought again is its own effect — a
            treatment that lifts an asset out of the window its rules test will not re-qualify until the asset decays
            back. Raise this where a model has been seen to repeat work it should not. Blank uses{" "}
            {DEFAULT_RETREATMENT_INTERVAL_YEARS} years.
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-4">
          <Label htmlFor="description">Description</Label>
          <input
            id="description"
            name="description"
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            className={input}
          />
        </div>
      </div>

      {/* "When it can be used" used to live here as a condition window, a
          material list and diameter bounds. Those are now named rules, chosen
          in their own section and written on the Treatment Rules page, so that
          the same condition can gate several treatments instead of being
          retyped into each. */}
      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Notes</legend>
        <div className="space-y-1.5">
          <Label htmlFor="implementationConstraints">Implementation constraints</Label>
          <input
            id="implementationConstraints"
            name="implementationConstraints"
            value={draft.implementationConstraints}
            onChange={(e) => onChange({ implementationConstraints: e.target.value })}
            placeholder="Requires temporary bypass; not suitable below 6 inch diameter."
            className={input}
          />
          <p className="text-xs text-muted-foreground">
            Shown alongside a recommendation. A note for whoever reads it — it does not decide anything, so anything
            that should actually rule an asset in or out belongs in a rule.
          </p>
        </div>
      </fieldset>
    </div>
  );
}

/** Condition effect, failure probability and life extension. */
export function EffectFields({ draft, onChange }: FieldProps) {
  return (
    <div className="space-y-5">
      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Effects</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="effectMode">Condition effect</Label>
            <select
              id="effectMode"
              name="effectMode"
              value={draft.effectMode}
              onChange={(e) => onChange({ effectMode: e.target.value as "reset" | "gain" })}
              className={input}
            >
              <option value="reset">Resets condition to</option>
              <option value="gain">Adds points</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="effectValue">{draft.effectMode === "reset" ? "New WCI" : "Points added"}</Label>
            <input
              id="effectValue"
              name="effectValue"
              type="number"
              step="any"
              value={draft.effectValue}
              onChange={(e) => onChange({ effectValue: e.target.value })}
              className={input}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="failureProbMultiplier">Failure prob. ×</Label>
            <input
              id="failureProbMultiplier"
              name="failureProbMultiplier"
              type="number"
              min={0}
              max={1}
              step="any"
              value={draft.failureProbMultiplier}
              onChange={(e) => onChange({ failureProbMultiplier: e.target.value })}
              className={input}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expectedLifeExtension">Life extension (yr)</Label>
            <input
              id="expectedLifeExtension"
              name="expectedLifeExtension"
              type="number"
              min={0}
              value={draft.expectedLifeExtension}
              onChange={(e) => onChange({ expectedLifeExtension: e.target.value })}
              className={input}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A treatment that <em>resets</em> condition renews the asset; one that only <em>adds points</em> is a patch
          and stays on the same deterioration path in life-cycle cost. Failure multiplier of 1 means no effect, 0.2
          means an 80% cut.
        </p>
      </fieldset>
    </div>
  );
}
