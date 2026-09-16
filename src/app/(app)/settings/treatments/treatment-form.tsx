"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CircleDot } from "lucide-react";
import { CollapsibleSection as Section, SectionDirty } from "@/components/layout/collapsible-section";
import { CancelOrDiscard } from "@/components/layout/save-actions";
import { saveTreatmentAction, deleteTreatmentAction } from "./actions";
import {
  DefinitionFields,
  Feedback,
  draftFromTreatment,
  type TreatmentDraft,
} from "./treatment-fields";
import { EMPTY_TREATMENT_STATE, type TreatmentActionState } from "./state";
import type { TreatmentAdminRow } from "@/server/treatment-config";

/**
 * An existing treatment's definition. What it does is a section of its own now
 * — effects are shared rows chosen from a library, saved separately, like the
 * rules — see [id]/effect-list-editor.tsx.
 *
 * Creating a treatment is a page of its own, not a blank copy of this form
 * dropped below the library: an empty form sitting under a list reads as part
 * of the list, and it could only ever offer half of what a treatment has —
 * costs and rules need a treatment to attach to.
 */
export function TreatmentForm({ treatment }: { treatment: TreatmentAdminRow }) {
  const [state, submit, pending] = useActionState<TreatmentActionState, FormData>(
    saveTreatmentAction,
    EMPTY_TREATMENT_STATE
  );
  // Saved values, and what is in the boxes now. Held rather than left to the
  // DOM because React empties an uncontrolled form once its action returns —
  // which would throw away an edit precisely when a save was refused.
  const [stored, setStored] = useState<TreatmentDraft>(() => draftFromTreatment(treatment));
  const [draft, setDraft] = useState<TreatmentDraft>(stored);
  const patch = (change: Partial<TreatmentDraft>) => setDraft((d) => ({ ...d, ...change }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored);

  // What went to the server, so a success can be recognised as saving exactly
  // those values — and not whatever has been typed since.
  const submitted = useRef<TreatmentDraft | null>(null);
  useEffect(() => {
    if (state.status === "success" && submitted.current) {
      setStored(submitted.current);
      submitted.current = null;
    }
  }, [state]);

  return (
    <div className="space-y-4">
      <Feedback state={state} />

      {/* Sections hide their content rather than unmounting it, which is what
          lets a folded-away field keep an unsaved edit. */}
      <form
        action={submit}
        onSubmit={() => {
          submitted.current = draft;
        }}
        className="space-y-4"
      >
        <input type="hidden" name="id" value={treatment.id} />

        <Section
          id="definition"
          title="Treatment Definition"
          description="What it is called, what kind of work it is, and how long it lasts."
        >
          <SectionDirty dirty={dirty} />
          <DefinitionFields draft={draft} onChange={patch} />
        </Section>

        {/* Outside the section, so it stays reachable when the section is
            folded away. */}
        <div className="flex items-center justify-end gap-2">
          {dirty && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
              <CircleDot className="h-3 w-3" />
              Unsaved changes
            </span>
          )}
          <CancelOrDiscard dirty={dirty} onDiscard={() => setDraft(stored)} disabled={pending} size="default" />
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? "Saving…" : dirty ? "Save Treatment" : "Saved"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * Deleting the treatment, kept apart from the form and rendered last on the
 * page. It belongs after everything describing the treatment, not in the
 * middle of it — a destructive control interrupting a run of editable
 * sections is easy to reach for by accident.
 */
export function TreatmentDangerZone({ treatment }: { treatment: TreatmentAdminRow }) {
  const [state, remove, deleting] = useActionState<TreatmentActionState, FormData>(
    deleteTreatmentAction,
    EMPTY_TREATMENT_STATE
  );

  return (
    <div className="space-y-3">
      <Feedback state={state} />
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <p className="text-xs text-muted-foreground">
            {treatment.workPlanItemCount > 0
              ? `Used by ${treatment.workPlanItemCount} work plan project(s) — deletion will be refused while those exist.`
              : "Not referenced by any work plan project."}
          </p>
          <form action={remove}>
            <input type="hidden" name="id" value={treatment.id} />
            <ConfirmDelete
              disabled={deleting}
              pendingLabel="Deleting…"
              title={`Delete ${treatment.name}?`}
              description={
                treatment.workPlanItemCount > 0
                  ? `Work plans use it in ${treatment.workPlanItemCount} projects, so deletion will be refused. Delete or regenerate those plans first.`
                  : `${treatment.name} is removed from the library with its prices and rules${
                      treatment.combinationCount > 0
                        ? `, and from the ${treatment.combinationCount} combination${treatment.combinationCount === 1 ? "" : "s"} it belongs to`
                        : ""
                    }. This cannot be undone.`
              }
            >
              Delete Treatment
            </ConfirmDelete>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
