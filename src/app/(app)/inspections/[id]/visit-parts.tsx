"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReadingInput } from "@/components/inspections/reading-input";
import type { VisitComponent, VisitField, VisitPart } from "@/server/component-inspections";
import type { EditState } from "./actions";

type FormAction = (prev: EditState, formData: FormData) => Promise<EditState>;

type Editing =
  | { mode: "edit"; part: VisitPart }
  | { mode: "add"; component: VisitComponent };

const EMPTY: EditState = { status: "idle" };

function Feedback({ state }: { state: EditState }) {
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

/**
 * What was found on each component on this visit: the rating that became its
 * condition, the risk that followed, and the readings behind them — each
 * correctable, and any part the visit's form skipped can still be recorded.
 */
export function VisitParts({
  visitId,
  parts,
  missing,
  canEdit,
  onSave,
  onAdd,
}: {
  visitId: string;
  parts: VisitPart[];
  /** Components of the asset with nothing recorded on this visit. */
  missing: VisitComponent[];
  canEdit: boolean;
  onSave: FormAction;
  onAdd: FormAction;
}) {
  const [state, setState] = useState<EditState>(EMPTY);
  const [editing, setEditingState] = useState<Editing | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (next: Editing) => {
    setState(EMPTY);
    setEditingState(next);
  };

  const submit = (formData: FormData) =>
    startTransition(async () => {
      const result = await (editing?.mode === "edit" ? onSave : onAdd)(EMPTY, formData);
      setState(result);
      if (result.status === "success") setEditingState(null);
    });

  if (parts.length === 0 && missing.length === 0) return null;

  const fields: VisitField[] = editing?.mode === "edit" ? editing.part.fields : (editing?.component.fields ?? []);
  const values = editing?.mode === "edit" ? editing.part.values : {};

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Components</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        {!editing && state.status !== "idle" && (
          <div className="px-4 pt-1">
            <Feedback state={state} />
          </div>
        )}
        {parts.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Condition</TableHead>
                  <TableHead className="text-right">Risk</TableHead>
                  <TableHead>Readings</TableHead>
                  <TableHead>Notes</TableHead>
                  {canEdit && <TableHead className="w-16" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((p) => {
                  const readings = p.readings.filter((r) => r.code !== "CONDITION");
                  return (
                    <TableRow key={p.id} className="align-top">
                      <TableCell className="min-w-40">
                        <span className="font-medium">{p.label}</span>
                        <span className="block text-xs text-muted-foreground">{p.templateName}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.condition ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.risk ?? "—"}</TableCell>
                      <TableCell className="min-w-72 text-sm">
                        {readings.length === 0 ? (
                          <span className="text-muted-foreground">None recorded</span>
                        ) : (
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                            {readings.map((r) => (
                              <div key={r.code} className="contents">
                                <dt className="text-muted-foreground">{r.label}</dt>
                                <dd className="tabular-nums">{r.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </TableCell>
                      <TableCell className="max-w-64 text-sm text-muted-foreground">{p.notes ?? "—"}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => open({ mode: "edit", part: p })}
                            aria-label={`Edit ${p.label}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-4 text-sm text-muted-foreground">
            <span>Not inspected on this visit:</span>
            {missing.map((c) =>
              canEdit ? (
                <Button key={c.id} type="button" size="sm" variant="outline" onClick={() => open({ mode: "add", component: c })}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {c.label}
                </Button>
              ) : (
                <span key={c.id} className="rounded border px-2 py-0.5">
                  {c.label}
                </span>
              )
            )}
          </div>
        )}
        {parts.length > 0 && missing.length === 0 && <div className="pb-1" />}
      </CardContent>

      {canEdit && (
        <EditorDialog
          open={editing != null}
          onClose={() => setEditingState(null)}
          title={
            editing?.mode === "edit"
              ? `Edit ${editing.part.label} findings`
              : `Record ${editing?.component.label ?? ""} findings`
          }
          description={
            editing?.mode === "edit"
              ? "Correct what was recorded on this visit. A changed rating changes this component's condition and risk, and the asset's score with them."
              : "Findings for a part this visit reached but didn't record. They are dated with the visit."
          }
        >
          {editing && <Feedback state={state} />}
          {editing && (
            <form action={submit} className="space-y-4" key={editing.mode === "edit" ? editing.part.id : editing.component.id}>
              {editing.mode === "edit" ? (
                <input type="hidden" name="findingId" value={editing.part.id} />
              ) : (
                <>
                  <input type="hidden" name="visitId" value={visitId} />
                  <input type="hidden" name="componentId" value={editing.component.id} />
                </>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fields.map((field) => (
                  <ReadingInput key={field.id} field={field} name={`field:${field.id}`} defaultValue={values[field.id]} />
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="finding-notes">Notes</Label>
                <textarea
                  id="finding-notes"
                  name="notes"
                  rows={2}
                  defaultValue={editing.mode === "edit" ? (editing.part.notes ?? "") : ""}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingState(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : editing.mode === "edit" ? "Save findings" : "Add findings"}
                </Button>
              </div>
            </form>
          )}
        </EditorDialog>
      )}
    </Card>
  );
}
