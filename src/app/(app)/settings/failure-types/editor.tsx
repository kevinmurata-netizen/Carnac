"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FailureTypeRow } from "@/server/settings";
import { saveFailureTypesAction, createFailureTypeAction, deleteFailureTypeAction } from "../actions";
import { EMPTY_SETTINGS_STATE, type SettingsActionState } from "../state";
import { SaveBar } from "../save-bar";
import { formatNumber } from "@/lib/format";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** The labels form and the per-row delete buttons are siblings, associated by
 * the `form` attribute — a delete button nested inside the labels form would
 * submit that form instead of its own. */
const LABELS_FORM_ID = "failure-type-labels";

export function FailureTypeEditor({ types }: { types: FailureTypeRow[] }) {
  const [saveState, saveAction] = useActionState(saveFailureTypesAction, EMPTY_SETTINGS_STATE);
  const [createState, createAction] = useActionState(createFailureTypeAction, EMPTY_SETTINGS_STATE);
  const [deleteState, deleteAction] = useActionState(deleteFailureTypeAction, EMPTY_SETTINGS_STATE);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Failure Types <span className="text-sm font-normal text-muted-foreground">({types.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteState.status === "error" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {deleteState.message}
            </div>
          )}

          <form id={LABELS_FORM_ID} action={saveAction} />
          <form action={deleteAction}>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Code</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead className="w-32">Recorded</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.code}</TableCell>
                      <TableCell>
                        <input
                          name={`label_${t.id}`}
                          form={LABELS_FORM_ID}
                          defaultValue={t.label}
                          className={input}
                          aria-label={`Label for ${t.code}`}
                        />
                      </TableCell>
                      <TableCell className="text-sm">{formatNumber(t.eventCount)}</TableCell>
                      <TableCell>
                        <Button
                          type="submit"
                          name="id"
                          value={t.id}
                          size="sm"
                          variant="ghost"
                          disabled={t.eventCount > 0}
                          title={
                            t.eventCount > 0
                              ? `${t.eventCount} recorded events reference this type`
                              : `Remove ${t.label}`
                          }
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </form>

          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              The code is what recorded failures and any CSV import refer to, so only the display label is editable
              once a type exists. A type with recorded events cannot be removed — deleting it would leave those
              failures with no cause.
            </p>
            <FormSaveBar formId={LABELS_FORM_ID} state={saveState} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Add a Failure Type</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAction} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="code">Code</Label>
                <input id="code" name="code" required placeholder="e.g. SURGE" className={input} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="label">Label</Label>
                <input id="label" name="label" required placeholder="e.g. Pressure Surge" className={input} />
              </div>
            </div>
            <SaveBar state={createState} label="Add type" hint="Codes are upper-cased and must be unique." />
          </form>
        </CardContent>
      </Card>
    </>
  );
}

/** SaveBar reads useFormStatus, which only reports for a form it is inside.
 * The labels form is an empty sibling element, so this button targets it by id
 * and reports its own state instead. */
function FormSaveBar({ formId, state }: { formId: string; state: SettingsActionState }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div className="min-w-0 text-xs">
        {state.status === "error" && <span className="text-destructive">{state.message}</span>}
        {state.status === "success" && <span className="text-emerald-600">{state.message}</span>}
        {state.status === "idle" && <span className="text-muted-foreground">Edit any label, then save.</span>}
      </div>
      <Button type="submit" form={formId} className="shrink-0">
        Save labels
      </Button>
    </div>
  );
}
