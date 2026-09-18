"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EditorDialog } from "@/components/ui/editor-dialog";

export type CopyableSet = { id: string; name: string; status: string; baseYear: number; planningPeriodYears: number };
export type CopyableScenario = { id: string; name: string; setId: string };

const control =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Copy a scenario set from the Scenario Planning page: pick the set, then pick
 * which of its scenarios come with it.
 *
 * The set's own page already copies itself whole. This is the other way round —
 * you are on the list, you know which programme you want a variant of, and
 * often you want most of its scenarios but not all. Everything is ticked to
 * start with, because copying a set usually means copying what is in it; the
 * ticks are there to leave one behind, not to build the copy up from nothing.
 */
export function CopyScenarioSetDialog({
  sets,
  scenarios,
  action,
}: {
  sets: CopyableSet[];
  scenarios: CopyableScenario[];
  action: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [setId, setSetId] = useState(sets[0]?.id ?? "");
  const [excluded, setExcluded] = useState<string[]>([]);

  // Changing the set starts from everything ticked again, at render rather
  // than in an effect so a stale selection is never painted.
  const [pickedFor, setPickedFor] = useState(setId);
  if (pickedFor !== setId) {
    setPickedFor(setId);
    setExcluded([]);
  }

  const members = scenarios.filter((s) => s.setId === setId);
  const chosen = members.filter((s) => !excluded.includes(s.id));
  const source = sets.find((s) => s.id === setId);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} disabled={sets.length === 0}>
        <Copy className="mr-1 h-4 w-4" />
        Copy Scenario Set
      </Button>

      <EditorDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Copy a scenario set"
        description="The copy keeps the window and everything each scenario is set to consider, but none of their results — it has not run yet. It starts as a Draft, named after the original."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={setId} />
          {/* Says the scenarios were chosen, so unticking every one copies the
              set by itself instead of reading as "nothing said". */}
          <input type="hidden" name="pick" value="1" />

          <div className="space-y-1.5">
            <Label htmlFor="copy-set">Copy from</Label>
            <select
              id="copy-set"
              value={setId}
              onChange={(e) => setSetId(e.target.value)}
              className={control}
            >
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.status === "ARCHIVED" ? " (archived)" : ""} — {s.baseYear}–{s.baseYear + s.planningPeriodYears - 1}
                  {`, ${scenarios.filter((x) => x.setId === s.id).length} scenarios`}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Scenarios to copy</Label>
              {members.length > 0 && (
                <span className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExcluded([])}>
                    Select all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setExcluded(members.map((s) => s.id))}
                  >
                    Clear
                  </Button>
                </span>
              )}
            </div>

            {members.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                This set has no scenarios yet, so only the set itself is copied.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {members.map((s) => {
                  const on = !excluded.includes(s.id);
                  return (
                    <li key={s.id}>
                      <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={on}
                          onChange={() =>
                            setExcluded((all) => (on ? [...all, s.id] : all.filter((x) => x !== s.id)))
                          }
                        />
                        <span>{s.name}</span>
                      </label>
                      {on && <input type="hidden" name="scenarioIds" value={s.id} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {source
              ? `Copies ${source.name} with ${chosen.length} of ${members.length} scenario${members.length === 1 ? "" : "s"}, over ${source.baseYear}–${source.baseYear + source.planningPeriodYears - 1}. The copy opens once it is made.`
              : "Choose a set to copy."}
          </p>

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <CopyButton count={chosen.length} disabled={!setId} />
          </div>
        </form>
      </EditorDialog>
    </>
  );
}

/** Its own component so it can read the form's pending state: copying a set
 * with several scenarios is a few hundred milliseconds of work. */
function CopyButton({ count, disabled }: { count: number; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={disabled || pending}>
      {pending ? "Copying…" : count > 0 ? `Copy set and ${count} scenario${count === 1 ? "" : "s"}` : "Copy set only"}
    </Button>
  );
}
