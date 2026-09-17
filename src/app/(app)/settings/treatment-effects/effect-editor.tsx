"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { CancelOrDiscard } from "@/components/layout/save-actions";
import { describeEffect, type EffectConditionMode } from "@/domain/waterline/effect";
import type { EffectSummary } from "@/server/effects";
import type { EffectPayload } from "./actions";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Numbers held as strings, so an emptied box stays empty rather than snapping
 * back to zero under the cursor. */
export type EffectDraft = {
  id: string | null;
  name: string;
  description: string;
  conditionMode: EffectConditionMode;
  conditionValue: string;
  failureProbMultiplier: string;
  expectedLifeExtension: string;
};

export const BLANK_EFFECT: EffectDraft = {
  id: null,
  name: "",
  description: "",
  conditionMode: "gain",
  conditionValue: "",
  failureProbMultiplier: "1",
  expectedLifeExtension: "0",
};

/** A stored effect as the editor holds it. */
export function effectDraftOf(effect: EffectSummary): EffectDraft {
  return {
    id: effect.id,
    name: effect.name,
    description: effect.description ?? "",
    conditionMode: effect.conditionMode,
    conditionValue: effect.conditionValue == null ? "" : String(effect.conditionValue),
    failureProbMultiplier: String(effect.failureProbMultiplier),
    expectedLifeExtension: String(effect.expectedLifeExtension),
  };
}

function toPayload(draft: EffectDraft): EffectPayload {
  const number = (s: string) => (s.trim() === "" ? NaN : Number(s));
  return {
    id: draft.id,
    name: draft.name,
    description: draft.description,
    conditionMode: draft.conditionMode,
    conditionValue: draft.conditionMode === "none" ? null : number(draft.conditionValue),
    failureProbMultiplier: number(draft.failureProbMultiplier),
    expectedLifeExtension: number(draft.expectedLifeExtension),
  };
}

type SaveResult = { ok: boolean; message: string; id?: string };

/**
 * Writing or editing one effect.
 *
 * Used in two places, and it has to work in both without either knowing
 * about the other:
 *
 *  - **In a pop-up** (`inDialog`) — over the Treatment Effects list, or over
 *    a treatment, where leaving would lose your place: Cancel, Save and
 *    Save & close, so there is always a way back without the browser's back
 *    button. Delete is offered when the caller passes `onDelete`, which the
 *    effects list does and a treatment does not.
 *  - **Inline**, with Discard and Save in place of those.
 *
 * `onSaved` reports the id, and whether the caller asked to close, so the
 * treatment page can add a newly written effect to the treatment straight away.
 */
export function EffectEditor({
  initial,
  usedBy,
  onSave,
  onSaved,
  onCancel,
  onDelete,
  inDialog = false,
  /** When writing a new effect from a treatment, the treatment it will be
   * added to — so the warning about sharing can leave that one out. */
  forTreatment,
}: {
  initial: EffectDraft;
  usedBy: string[];
  onSave: (payload: EffectPayload) => Promise<SaveResult>;
  onSaved?: (id: string, close: boolean) => void;
  onCancel?: () => void;
  onDelete?: (id: string) => Promise<{ ok: boolean; message: string }>;
  inDialog?: boolean;
  forTreatment?: string;
}) {
  const [draft, setDraft] = useState<EffectDraft>(initial);
  const [saved, setSaved] = useState<EffectDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const patch = (change: Partial<EffectDraft>) => setDraft((d) => ({ ...d, ...change }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const changed = (key: keyof EffectDraft) => (draft[key] !== saved[key] ? `${input} border-amber-500` : input);
  const others = usedBy.filter((name) => name !== forTreatment);

  const preview = toPayload(draft);
  const previewReadable =
    (preview.conditionMode === "none" || Number.isFinite(preview.conditionValue)) &&
    Number.isFinite(preview.failureProbMultiplier) &&
    Number.isFinite(preview.expectedLifeExtension);

  const save = async (close: boolean) => {
    setBusy(true);
    setResult(null);
    const outcome = await onSave(toPayload(draft));
    setResult(outcome);
    if (outcome.ok && outcome.id) {
      const stored = { ...draft, id: outcome.id };
      setDraft(stored);
      setSaved(stored);
      onSaved?.(outcome.id, close);
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      {others.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Shared: {others.join(", ")} {others.length === 1 ? "also uses" : "also use"} this effect, so saving a change
            changes {others.length === 1 ? "it" : "them"} too.
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="effect-name">Name</Label>
          <input
            id="effect-name"
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="e.g. Structural liner"
            className={changed("name")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="effect-description">Description</Label>
          <input
            id="effect-description"
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Optional — when you would use it"
            className={changed("description")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="effect-mode">Condition</Label>
          <select
            id="effect-mode"
            value={draft.conditionMode}
            onChange={(e) => patch({ conditionMode: e.target.value as EffectConditionMode })}
            className={changed("conditionMode")}
          >
            <option value="reset">Resets condition to</option>
            <option value="gain">Adds points</option>
            <option value="none">No change</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="effect-value">
            {draft.conditionMode === "reset" ? "New WCI" : draft.conditionMode === "gain" ? "Points added" : "—"}
          </Label>
          <input
            id="effect-value"
            type="number"
            min={0}
            max={100}
            step="any"
            value={draft.conditionMode === "none" ? "" : draft.conditionValue}
            disabled={draft.conditionMode === "none"}
            onChange={(e) => patch({ conditionValue: e.target.value })}
            className={changed("conditionValue")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="effect-multiplier">Failure prob. ×</Label>
          <input
            id="effect-multiplier"
            type="number"
            min={0}
            max={1}
            step="any"
            value={draft.failureProbMultiplier}
            onChange={(e) => patch({ failureProbMultiplier: e.target.value })}
            className={changed("failureProbMultiplier")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="effect-life">Life extension (yr)</Label>
          <input
            id="effect-life"
            type="number"
            min={0}
            step={1}
            value={draft.expectedLifeExtension}
            onChange={(e) => patch({ expectedLifeExtension: e.target.value })}
            className={changed("expectedLifeExtension")}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {previewReadable ? (
          <>
            Reads as: <span className="font-medium text-foreground">{describeEffect(preview)}</span>.{" "}
          </>
        ) : null}
        A <em>reset</em> renews the asset; <em>adding points</em> is a patch that stays on the same deterioration path
        in life-cycle cost. A failure multiplier of 1 means no effect, 0.2 an 80% cut.
      </p>

      {result && (
        <p
          className={`flex items-start gap-2 text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}
          role="status"
        >
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          {result.message}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        {draft.id && onDelete && (
          <div className="mr-auto">
            <ConfirmDelete
              variant="ghost"
              disabled={busy}
              title={`Delete the effect “${saved.name}”?`}
              description={
                usedBy.length > 0
                  ? `It is still used by ${usedBy.join(", ")}, so deletion will be refused. Remove it from those treatments first.`
                  : "No treatment uses it. This cannot be undone."
              }
              onConfirm={async () => {
                setBusy(true);
                const outcome = await onDelete(draft.id!);
                setResult(outcome);
                setBusy(false);
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </ConfirmDelete>
          </div>
        )}

        {dirty && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
            <CircleDot className="h-3 w-3" />
            Unsaved changes
          </span>
        )}

        {inDialog ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={busy}>
              {dirty ? "Cancel" : "Close"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => save(false)} disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" onClick={() => save(true)} disabled={busy || !dirty}>
              {busy ? "Saving…" : draft.id ? "Save & close" : forTreatment ? "Create & add" : "Create & close"}
            </Button>
          </>
        ) : (
          <>
            <CancelOrDiscard dirty={dirty} onDiscard={() => setDraft(saved)} disabled={busy} />
            <Button type="button" size="sm" onClick={() => save(false)} disabled={busy || !dirty}>
              {busy ? "Saving…" : dirty ? (draft.id ? "Save changes" : "Create effect") : "Saved"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
