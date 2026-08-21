"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RenameableSection } from "@/server/navigation";
import { saveNavLabelsAction, resetNavLabelsAction } from "../actions";
import { EMPTY_SETTINGS_STATE } from "../state";
import { RotateCcw } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The rename form and the reset button are siblings associated by `form` id —
 * a reset button nested inside the rename form would submit that form. */
const RENAME_FORM_ID = "nav-rename";

export function NavigationEditor({ sections }: { sections: RenameableSection[] }) {
  const [saveState, saveAction] = useActionState(saveNavLabelsAction, EMPTY_SETTINGS_STATE);
  const [resetState, resetAction] = useActionState(resetNavLabelsAction, EMPTY_SETTINGS_STATE);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(sections.flatMap((s) => s.items.map((i) => [i.href, i.label])))
  );

  const defaults = Object.fromEntries(sections.flatMap((s) => s.items.map((i) => [i.href, i.defaultLabel])));
  const changedCount = Object.entries(values).filter(([href, v]) => v.trim() !== defaults[href]).length;

  return (
    <>
      <form id={RENAME_FORM_ID} action={saveAction} />

      <div className="space-y-4">
        {sections.map((section) => (
          <Card key={section.group}>
            <CardHeader>
              <CardTitle className="text-base">{section.group}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {section.items.map((item) => {
                const value = values[item.href] ?? item.label;
                const isChanged = value.trim() !== item.defaultLabel;
                return (
                  <div key={item.href} className="grid grid-cols-12 items-center gap-3">
                    <div className="col-span-12 min-w-0 sm:col-span-5">
                      <div className="truncate text-sm text-foreground">{item.defaultLabel}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{item.href}</div>
                    </div>
                    <div className="col-span-9 sm:col-span-5">
                      <input
                        name={`label_${item.href}`}
                        form={RENAME_FORM_ID}
                        value={value}
                        maxLength={40}
                        onChange={(e) => setValues((p) => ({ ...p, [item.href]: e.target.value }))}
                        className={input}
                        aria-label={`Name for ${item.defaultLabel}`}
                      />
                    </div>
                    <div className="col-span-3 flex items-center gap-1 sm:col-span-2">
                      {isChanged && (
                        <>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Renamed
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setValues((p) => ({ ...p, [item.href]: item.defaultLabel }))}
                            aria-label={`Reset ${item.defaultLabel}`}
                            title={`Reset to "${item.defaultLabel}"`}
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardContent className="space-y-4 pt-6">
          <p className="text-xs text-muted-foreground">
            A rename applies in three places at once — the sidebar, the breadcrumb trail and the page&apos;s own
            heading — so they never disagree. URLs are unchanged, which keeps existing links and bookmarks working.
          </p>
          <p className="text-xs text-muted-foreground">
            Only renamed pages are stored. Setting a name back to its original removes the override entirely, so that
            page follows the default again.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="min-w-0 text-xs">
              {saveState.status === "error" && <span className="text-destructive">{saveState.message}</span>}
              {saveState.status === "success" && <span className="text-emerald-600">{saveState.message}</span>}
              {resetState.status === "success" && <span className="text-emerald-600">{resetState.message}</span>}
              {saveState.status === "idle" && resetState.status === "idle" && (
                <span className="text-muted-foreground">
                  {changedCount === 0
                    ? "All pages use their default names."
                    : `${changedCount} page${changedCount === 1 ? "" : "s"} renamed.`}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ResetButton action={resetAction} />
              <Button type="submit" form={RENAME_FORM_ID}>
                Save names
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function ResetButton({ action }: { action: (formData: FormData) => void }) {
  return (
    <form action={action}>
      <Button type="submit" variant="outline">
        Reset all to defaults
      </Button>
    </form>
  );
}
