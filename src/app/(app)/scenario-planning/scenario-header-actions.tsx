"use client";

import { Button } from "@/components/ui/button";
import { CircleDot } from "lucide-react";
import { RunProgressButton } from "./run-progress";
import { SCENARIO_EDIT_FORM_ID, useScenarioEdit } from "./scenario-edit-state";
import type { RunEstimate } from "@/server/run-estimate";

/**
 * Re-run, or Save & Re-run once something has changed.
 *
 * One control in one place. Before this, Re-run sat in the header and
 * Save & Re-run sat at the foot of a form two screens down, so the button that
 * mattered was the one you had to go looking for — and it was possible to
 * press Re-run at the top while unsaved edits waited below, quietly running
 * the old parameters.
 *
 * The two swap rather than sitting side by side, because with unsaved changes
 * "Re-run" is not something anyone means: it would discard the edit in all but
 * name. Saving re-runs anyway, so nothing is lost by taking it away.
 *
 * The submit button is outside the form element and associates by id. That is
 * why `pending` is passed rather than read from `useFormStatus`, which only
 * reports for a form the caller sits inside.
 */
export function ScenarioHeaderActions({
  estimate,
  rerun,
}: {
  estimate: RunEstimate;
  /** The plain Re-run form, rendered by the page so the server action and its
   * hidden scenario id stay together. */
  rerun: React.ReactNode;
}) {
  const edit = useScenarioEdit();

  // No provider means the viewer cannot edit this scenario, so there is
  // nothing to save and Re-run is the whole story.
  if (!edit || !edit.dirty) return <>{rerun}</>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-600">
        <CircleDot className="h-3 w-3" />
        {edit.changedCount} unsaved change{edit.changedCount === 1 ? "" : "s"}
      </span>

      <Button type="button" size="sm" variant="ghost" onClick={edit.reset} disabled={edit.submitting}>
        Discard
      </Button>

      <RunProgressButton
        estimate={estimate}
        label="Save & Re-run"
        runningLabel="Saving and running…"
        form={SCENARIO_EDIT_FORM_ID}
        onSubmitStart={edit.markSubmitting}
        pending={edit.submitting}
      />
    </div>
  );
}
