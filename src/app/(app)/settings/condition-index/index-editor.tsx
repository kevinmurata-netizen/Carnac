"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveWeightsAction, addComponentAction, removeComponentAction, recalculateAction } from "./actions";
import { EMPTY_INDEX_STATE, type IndexActionState } from "./state";
import type { ConditionIndexConfig } from "@/server/condition-model";
import { AlertTriangle, CheckCircle2, Pencil, RotateCcw } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const WEIGHTS_FORM_ID = "wci-weights-form";

export function IndexEditor({ config, canEdit }: { config: ConditionIndexConfig; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [weightState, saveWeights, savingWeights] = useActionState<IndexActionState, FormData>(
    saveWeightsAction,
    EMPTY_INDEX_STATE
  );
  const [addState, addComponent, adding] = useActionState<IndexActionState, FormData>(
    addComponentAction,
    EMPTY_INDEX_STATE
  );
  const [removeState, removeComponent, removing] = useActionState<IndexActionState, FormData>(
    removeComponentAction,
    EMPTY_INDEX_STATE
  );
  const [recalcState, recalculate, recalculating] = useActionState<IndexActionState, FormData>(
    recalculateAction,
    EMPTY_INDEX_STATE
  );

  // Most recent non-idle result wins.
  const feedback = [recalcState, removeState, addState, weightState].find((s) => s.status !== "idle");
  const stale = feedback?.staleScores === true;

  return (
    <div className="space-y-4">
      {feedback?.message && (
        <Card
          className={
            feedback.status === "error"
              ? "border-destructive/40 bg-destructive/5"
              : "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
          }
        >
          <CardContent className="flex items-start gap-3 py-4">
            {feedback.status === "error" ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">{feedback.message}</p>
              {stale && canEdit && (
                <form action={recalculate} className="mt-2">
                  <Button type="submit" size="sm" variant="outline" disabled={recalculating}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    {recalculating ? "Recalculating…" : "Recalculate all scores now"}
                  </Button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Components &amp; Weights</CardTitle>
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant={editing ? "secondary" : "outline"} onClick={() => setEditing((v) => !v)}>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                {editing ? "Done editing" : "Edit weights"}
              </Button>
              <form action={recalculate}>
                <Button type="submit" size="sm" variant="outline" disabled={recalculating}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  {recalculating ? "Recalculating…" : "Recalculate scores"}
                </Button>
              </form>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Each component is a numeric inspection field scored 0–10. The index is their weighted average, rescaled
            to {config.scaleMin}–{config.scaleMax}. Weights are relative — they need not add up to 100, because the
            share column is what actually drives the score.
          </p>

          {/* The weights form is deliberately empty and sits OUTSIDE the table:
              each row also needs its own Remove form, and nested forms are
              invalid HTML — the browser silently drops the inner one. The
              weight inputs join this form via their `form` attribute instead. */}
          <form id={WEIGHTS_FORM_ID} action={saveWeights} />

          <div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="w-32">Weight</TableHead>
                    <TableHead className="w-28">Share</TableHead>
                    <TableHead>Recorded Answers</TableHead>
                    {canEdit && <TableHead className="w-24">Remove</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.components.map((c) => (
                    <TableRow key={c.code}>
                      <TableCell>
                        <div className="font-medium">{c.label}</div>
                        {c.helpText && <div className="text-xs text-muted-foreground">{c.helpText}</div>}
                        {c.orphaned && (
                          <Badge variant="destructive" className="mt-1">
                            No inspection field — cannot be scored
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.code}</TableCell>
                      <TableCell>
                        {editing ? (
                          <input
                            form={WEIGHTS_FORM_ID}
                            name={`weight_${c.code}`}
                            type="number"
                            min={0}
                            step="any"
                            defaultValue={c.weight}
                            className={input}
                          />
                        ) : (
                          <>
                            <span>{c.weight}</span>
                            <input
                              form={WEIGHTS_FORM_ID}
                              type="hidden"
                              name={`weight_${c.code}`}
                              value={c.weight}
                            />
                          </>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{c.sharePct}%</TableCell>
                      <TableCell>{c.resultCount.toLocaleString("en-US")}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <RemoveButton code={c.code} action={removeComponent} disabled={removing} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {editing && (
              <div className="mt-3 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Total weight {config.totalWeight.toFixed(2)} — shares recalculate on save.
                </p>
                <Button type="submit" form={WEIGHTS_FORM_ID} disabled={savingWeights}>
                  {savingWeights ? "Saving…" : "Save Weights"}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Add a Component</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "Cancel" : "Add component"}
            </Button>
          </CardHeader>
          {showAdd && (
            <CardContent className="space-y-6">
              {config.unusedFields.length > 0 && (
                <form action={addComponent} className="space-y-3 rounded-md border p-3">
                  <div className="text-sm font-medium">Use an existing inspection field</div>
                  <p className="text-xs text-muted-foreground">
                    These numeric fields are already collected but carry no weight, so they do not affect the score.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="existingFieldCode">Field</Label>
                      <select id="existingFieldCode" name="existingFieldCode" className={input} required>
                        {config.unusedFields.map((f) => (
                          <option key={f.code} value={f.code}>
                            {f.label} ({f.code}) — {f.resultCount} answers
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="existingWeight">Weight</Label>
                      <input id="existingWeight" name="weight" type="number" min={0} step="any" defaultValue={0.05} className={input} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={adding}>
                      {adding ? "Adding…" : "Add to Index"}
                    </Button>
                  </div>
                </form>
              )}

              <form action={addComponent} className="space-y-3 rounded-md border p-3">
                <div className="text-sm font-medium">Create a new component</div>
                <p className="text-xs text-muted-foreground">
                  This also creates the 0–10 inspection field that collects it, so inspectors can start scoring it
                  immediately.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="label">Name</Label>
                    <input id="label" name="label" required placeholder="e.g. Valve Condition" className={input} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="code">Code</Label>
                    <input id="code" name="code" required placeholder="VALVE_CONDITION" className={input} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="newWeight">Weight</Label>
                    <input id="newWeight" name="weight" type="number" min={0} step="any" defaultValue={0.05} className={input} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-3">
                    <Label htmlFor="helpText">Guidance for inspectors</Label>
                    <input
                      id="helpText"
                      name="helpText"
                      placeholder="0 = severe deficiency, 10 = no issue observed"
                      className={input}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={adding}>
                    {adding ? "Adding…" : "Create Component"}
                  </Button>
                </div>
              </form>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Condition Bands</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Band</TableHead>
                <TableHead>Range</TableHead>
                <TableHead>Colour</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.bands.map((b) => (
                <TableRow key={b.label}>
                  <TableCell className="font-medium">{b.label}</TableCell>
                  <TableCell>
                    {b.min}–{b.max}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: b.color }} />
                      <span className="font-mono text-xs">{b.color}</span>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            Bands are stored alongside the weights and are already read from the database wherever condition is
            displayed. Band editing is not wired into this screen yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function RemoveButton({
  code,
  action,
  disabled,
}: {
  code: string;
  action: (formData: FormData) => void;
  disabled: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="code" value={code} />
      <Button type="submit" size="xs" variant="destructive" disabled={disabled}>
        Remove
      </Button>
    </form>
  );
}
