"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleDot, Pencil, Plus, Sigma, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSectionDirty } from "@/components/layout/collapsible-section";
import { CancelOrDiscard } from "@/components/layout/save-actions";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { combineEffects, effectLabel, roundMultiplier } from "@/domain/waterline/effect";
import type { EffectSummary } from "@/server/effects";
import { EffectEditor, BLANK_EFFECT, type EffectDraft } from "../../treatment-effects/effect-editor";
import { saveEffectAction } from "../../treatment-effects/actions";

const control =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function draftOf(effect: EffectSummary): EffectDraft {
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

/**
 * The effects that say what a treatment does.
 *
 * Built like the rules section beside it: effects are written once and shared,
 * so this chooses from them rather than holding numbers of its own. There is no
 * arrangement to draw, because effects combine by fixed arithmetic rather than
 * by AND and OR — so the result of combining them is shown instead, since that
 * is the number everything downstream uses.
 *
 * Writing a new effect or editing one opens the editor in a pop-up over the
 * treatment. Leaving for the Treatment Effects page would lose your place;
 * here, closing the editor puts you back exactly where you were, and a new
 * effect is added to this treatment as it is created.
 *
 * Used two ways, like the rule editor: with `onSave` it saves itself (the
 * treatment's page); with `onChange` it only reports (the new-treatment page,
 * where there is no treatment yet to save against).
 */
export function EffectListEditor({
  allEffects,
  initialIds,
  treatmentName,
  canEdit,
  onSave,
  onChange,
}: {
  allEffects: EffectSummary[];
  initialIds: string[];
  /** Named in the sharing warning, so it can leave this treatment out. */
  treatmentName: string;
  canEdit: boolean;
  onSave?: (effectIds: string[]) => Promise<{ ok: boolean; message: string }>;
  onChange?: (effectIds: string[]) => void;
}) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>(initialIds);
  const [saved, setSaved] = useState<string[]>(initialIds);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [search, setSearch] = useState("");
  // Which editor is open: a draft to edit, or null for none. Each opening gets
  // a fresh key, so the editor starts from that draft — and saving without
  // closing does not remount it and blank what was just typed.
  const [editing, setEditingState] = useState<EffectDraft | null>(null);
  const [opening, setOpening] = useState(0);
  const setEditing = (draft: EffectDraft | null) => {
    if (draft) setOpening((n) => n + 1);
    setEditingState(draft);
  };

  const dirty = JSON.stringify(ids) !== JSON.stringify(saved);
  useSectionDirty(Boolean(onSave) && dirty);

  useEffect(() => {
    onChange?.(ids);
    // Reporting a value, not reacting to the callback — see RuleTreeEditor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const byId = useMemo(() => new Map(allEffects.map((e) => [e.id, e])), [allEffects]);
  const chosen = ids.map((id) => ({ id, effect: byId.get(id) }));
  const known = chosen.flatMap((c) => (c.effect ? [c.effect] : []));
  const combined = combineEffects(known);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEffects
      .filter((e) => !ids.includes(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.summary.toLowerCase().includes(q));
  }, [allEffects, ids, search]);
  const unusedCount = allEffects.filter((e) => !ids.includes(e.id)).length;

  const save = async () => {
    if (!onSave) return;
    setBusy(true);
    setResult(null);
    const outcome = await onSave(ids);
    setResult(outcome);
    if (outcome.ok) {
      setSaved(ids);
      router.refresh();
    }
    setBusy(false);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {ids.length === 0
            ? "No effects, so this treatment changes nothing about condition or risk."
            : `${ids.length} effect${ids.length === 1 ? "" : "s"}${ids.length > 1 ? ", combined" : ""}.`}{" "}
          <Link href="/settings/treatment-effects" className="text-primary hover:underline">
            All effects →
          </Link>
        </p>
        {canEdit && onSave && (
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                <CircleDot className="h-3 w-3" />
                Unsaved changes
              </span>
            )}
            <CancelOrDiscard dirty={dirty} onDiscard={() => setIds(saved)} disabled={busy} />
            <Button type="button" size="sm" onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2 border-l-2 border-muted pl-4">
        {chosen.map(({ id, effect }) => (
          <div key={id} className="flex items-start gap-2 rounded-md border bg-background px-3 py-2">
            <span className="min-w-0 flex-1">
              {effect ? (
                <>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setEditing(draftOf(effect))}
                      className="group inline-flex items-center gap-1 text-left font-medium text-primary hover:underline"
                      title="Edit this effect"
                    >
                      {effect.name}
                      <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ) : (
                    <span className="font-medium">{effect.name}</span>
                  )}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {effect.summary}
                    {effect.usedBy.filter((n) => n !== treatmentName).length > 0 && (
                      <> · also used by {effect.usedBy.filter((n) => n !== treatmentName).join(", ")}</>
                    )}
                  </span>
                </>
              ) : (
                // Usually a moment after creating one, before the page has
                // reloaded the library; otherwise an effect deleted elsewhere.
                <span className="text-sm text-muted-foreground">Loading this effect…</span>
              )}
            </span>
            {canEdit && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Remove ${effect?.name ?? "this effect"}`}
                onClick={() => setIds((all) => all.filter((x) => x !== id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search effects…"
              aria-label="Search effects to add"
              className={`${control} w-44`}
            />
            <select
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) setIds((all) => (all.includes(id) ? all : [...all, id]));
                setSearch("");
              }}
              aria-label="Add an effect"
              className={`${control} max-w-sm`}
              disabled={unusedCount === 0}
            >
              <option value="">
                {unusedCount === 0
                  ? "Every effect is already added"
                  : available.length === 0
                    ? "No effect matches that search"
                    : `Add an existing effect… (${available.length})`}
              </option>
              {available.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ ...BLANK_EFFECT })}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Write a new effect
            </Button>
          </div>
        )}
      </div>

      {/* The number everything downstream reads. Shown even for one effect,
          so the section always ends with "this is what the treatment does". */}
      <div className="mt-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="mr-2 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Sigma className="h-3.5 w-3.5" />
          This treatment does
        </span>
        <span className="font-medium tabular-nums">
          {effectLabel({ ...combined, failureProbMultiplier: roundMultiplier(combined.failureProbMultiplier) })}
          {combined.expectedLifeExtension > 0 ? ` · +${combined.expectedLifeExtension} yr life` : " · no added life"}
        </span>
        {known.length > 1 && (
          <span className="mt-1 block text-xs text-muted-foreground">
            Combined: the highest reset wins, point gains add, failure multipliers multiply, and the longest life
            extension wins — the same way a treatment combination merges its members.
          </span>
        )}
      </div>

      {result && <p className={`mt-3 text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}>{result.message}</p>}

      <EditorDialog
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : "Write a new effect"}
        description={
          editing?.id
            ? "Changes apply to every treatment using this effect once saved."
            : `Created in the shared library and added to ${treatmentName}.`
        }
      >
        {editing && (
          <EffectEditor
            key={opening}
            initial={editing}
            usedBy={editing.id ? (byId.get(editing.id)?.usedBy ?? []) : []}
            forTreatment={treatmentName}
            inDialog
            onSave={saveEffectAction}
            onCancel={() => setEditing(null)}
            onSaved={(id, close) => {
              // A new effect joins this treatment straight away — as an
              // unsaved change to the list, like picking an existing one.
              if (!editing.id) setIds((all) => (all.includes(id) ? all : [...all, id]));
              router.refresh();
              if (close) setEditing(null);
            }}
          />
        )}
      </EditorDialog>
    </div>
  );
}
