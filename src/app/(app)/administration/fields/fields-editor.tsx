"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  saveInspectionFieldAction,
  createInspectionFieldAction,
  deleteInspectionFieldAction,
  saveInventoryFieldAction,
  createInventoryFieldAction,
  deleteInventoryFieldAction,
} from "./actions";
import { EMPTY_FIELD_STATE, type FieldActionState } from "./state";
import type { InspectionFieldRow, InventoryFieldRow } from "@/server/field-config";
import { AlertTriangle, CheckCircle2, Pencil } from "lucide-react";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const DATA_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "ENUM"] as const;

function Feedback({ state }: { state: FieldActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <div
      className={`mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
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

// ---------------------------------------------------------------------------

export function InspectionFieldsEditor({
  fields,
  canEdit,
}: {
  fields: InspectionFieldRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saveState, save, saving] = useActionState<FieldActionState, FormData>(
    saveInspectionFieldAction,
    EMPTY_FIELD_STATE
  );
  const [createState, create, creating] = useActionState<FieldActionState, FormData>(
    createInspectionFieldAction,
    EMPTY_FIELD_STATE
  );
  const [deleteState, remove, deleting] = useActionState<FieldActionState, FormData>(
    deleteInspectionFieldAction,
    EMPTY_FIELD_STATE
  );

  const feedback = [deleteState, createState, saveState].find((s) => s.status !== "idle") ?? EMPTY_FIELD_STATE;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Inspection Fields</CardTitle>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant={editing ? "secondary" : "outline"} onClick={() => setEditing((v) => !v)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {editing ? "Done editing" : "Edit fields"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "Cancel" : "Add field"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Feedback state={feedback} />
        <p className="text-xs text-muted-foreground">
          What an inspector is asked in the field. Numeric fields carrying an index weight also drive the condition
          score — those are managed on the Condition Index screen.
        </p>

        {showAdd && canEdit && (
          <form action={create} className="space-y-3 rounded-md border p-3">
            <div className="text-sm font-medium">New inspection field</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="i-label">Label</Label>
                <input id="i-label" name="label" required className={input} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="i-code">Code</Label>
                <input id="i-code" name="code" required placeholder="COATING_CONDITION" className={input} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="i-type">Type</Label>
                <select id="i-type" name="dataType" defaultValue="NUMBER" className={input}>
                  {DATA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="i-unit">Unit</Label>
                <input id="i-unit" name="unit" placeholder="optional" className={input} />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="i-help">Guidance</Label>
                <input id="i-help" name="helpText" className={input} />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <input id="i-req" name="isRequired" type="checkbox" defaultChecked className="h-4 w-4" />
                <Label htmlFor="i-req" className="font-normal">
                  Required
                </Label>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? "Creating…" : "Create Field"}
              </Button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Index Weight</TableHead>
                <TableHead>Answers</TableHead>
                {canEdit && editing && <TableHead className="w-40">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f) =>
                editing && canEdit ? (
                  <TableRow key={f.id}>
                    <TableCell colSpan={8} className="p-2">
                      <form action={save} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-12">
                        <input type="hidden" name="fieldId" value={f.id} />
                        <div className="sm:col-span-1">
                          <Label className="text-xs">Order</Label>
                          <input name="sortOrder" type="number" defaultValue={f.sortOrder} className={input} />
                        </div>
                        <div className="sm:col-span-3">
                          <Label className="text-xs">Label</Label>
                          <input name="label" defaultValue={f.label} required className={input} />
                        </div>
                        <div className="sm:col-span-2">
                          <span className="block text-xs text-muted-foreground">Code</span>
                          <span className="font-mono text-xs">{f.code}</span>
                        </div>
                        <div className="sm:col-span-1">
                          <Label className="text-xs">Unit</Label>
                          <input name="unit" defaultValue={f.unit ?? ""} className={input} />
                        </div>
                        <div className="sm:col-span-3">
                          <Label className="text-xs">Guidance</Label>
                          <input name="helpText" defaultValue={f.helpText ?? ""} className={input} />
                        </div>
                        <div className="flex items-center gap-1 sm:col-span-1">
                          <input name="isRequired" type="checkbox" defaultChecked={f.isRequired} className="h-4 w-4" />
                          <span className="text-xs">Req.</span>
                        </div>
                        <div className="flex gap-1 sm:col-span-1">
                          <Button type="submit" size="xs" disabled={saving}>
                            Save
                          </Button>
                        </div>
                      </form>
                      <form action={remove} className="mt-1">
                        <input type="hidden" name="fieldId" value={f.id} />
                        <Button type="submit" size="xs" variant="destructive" disabled={deleting}>
                          Delete field
                        </Button>
                        {(f.resultCount > 0 || f.indexWeight != null) && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {f.resultCount > 0 && `${f.resultCount} answers recorded`}
                            {f.resultCount > 0 && f.indexWeight != null && " · "}
                            {f.indexWeight != null && "used by the index"}
                            {" — deletion will be refused"}
                          </span>
                        )}
                      </form>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={f.id}>
                    <TableCell>{f.sortOrder}</TableCell>
                    <TableCell>
                      <div className="font-medium">{f.label}</div>
                      {f.helpText && <div className="text-xs text-muted-foreground">{f.helpText}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{f.code}</TableCell>
                    <TableCell>
                      {f.dataType}
                      {f.unit ? ` (${f.unit})` : ""}
                    </TableCell>
                    <TableCell>{f.isRequired ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      {f.indexWeight != null ? (
                        <Badge variant="default">{f.indexWeight}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{f.resultCount.toLocaleString("en-US")}</TableCell>
                    {canEdit && editing && <TableCell />}
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function InventoryFieldsEditor({
  fields,
  canEdit,
}: {
  fields: InventoryFieldRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [saveState, save, saving] = useActionState<FieldActionState, FormData>(
    saveInventoryFieldAction,
    EMPTY_FIELD_STATE
  );
  const [createState, create, creating] = useActionState<FieldActionState, FormData>(
    createInventoryFieldAction,
    EMPTY_FIELD_STATE
  );
  const [deleteState, remove, deleting] = useActionState<FieldActionState, FormData>(
    deleteInventoryFieldAction,
    EMPTY_FIELD_STATE
  );

  const feedback = [deleteState, createState, saveState].find((s) => s.status !== "idle") ?? EMPTY_FIELD_STATE;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Inventory Fields</CardTitle>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant={editing ? "secondary" : "outline"} onClick={() => setEditing((v) => !v)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {editing ? "Done editing" : "Edit fields"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "Cancel" : "Add field"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Feedback state={feedback} />
        <p className="text-xs text-muted-foreground">
          The extensible attributes recorded against each asset. These are stored as definition rows rather than
          columns, which is what lets a different asset class carry a completely different attribute set without a
          schema change.
        </p>

        {showAdd && canEdit && (
          <form action={create} className="space-y-3 rounded-md border p-3">
            <div className="text-sm font-medium">New inventory field</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="v-label">Label</Label>
                <input id="v-label" name="label" required className={input} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-code">Code</Label>
                <input id="v-code" name="code" required placeholder="PIPE_CLASS" className={input} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-type">Type</Label>
                <select id="v-type" name="dataType" defaultValue="TEXT" className={input}>
                  {DATA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-unit">Unit</Label>
                <input id="v-unit" name="unit" placeholder="in, ft, psi…" className={input} />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="v-options">ENUM options (comma-separated)</Label>
                <input id="v-options" name="options" placeholder="Low, Moderate, High" className={input} />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <input id="v-req" name="isRequired" type="checkbox" className="h-4 w-4" />
                <Label htmlFor="v-req" className="font-normal">
                  Required
                </Label>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? "Creating…" : "Create Field"}
              </Button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Values</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((f) =>
                editing && canEdit ? (
                  <TableRow key={f.id}>
                    <TableCell colSpan={6} className="p-2">
                      <form action={save} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-12">
                        <input type="hidden" name="definitionId" value={f.id} />
                        <div className="sm:col-span-1">
                          <Label className="text-xs">Order</Label>
                          <input name="sortOrder" type="number" defaultValue={f.sortOrder} className={input} />
                        </div>
                        <div className="sm:col-span-3">
                          <Label className="text-xs">Label</Label>
                          <input name="label" defaultValue={f.label} required className={input} />
                        </div>
                        <div className="sm:col-span-2">
                          <span className="block text-xs text-muted-foreground">Code · {f.dataType}</span>
                          <span className="font-mono text-xs">{f.code}</span>
                        </div>
                        <div className="sm:col-span-1">
                          <Label className="text-xs">Unit</Label>
                          <input name="unit" defaultValue={f.unit ?? ""} className={input} />
                        </div>
                        <div className="sm:col-span-3">
                          <Label className="text-xs">{f.dataType === "ENUM" ? "Options" : "Options (ENUM only)"}</Label>
                          <input
                            name="options"
                            defaultValue={f.options.join(", ")}
                            disabled={f.dataType !== "ENUM"}
                            className={`${input} disabled:opacity-50`}
                          />
                        </div>
                        <div className="flex items-center gap-1 sm:col-span-1">
                          <input name="isRequired" type="checkbox" defaultChecked={f.isRequired} className="h-4 w-4" />
                          <span className="text-xs">Req.</span>
                        </div>
                        <div className="sm:col-span-1">
                          <Button type="submit" size="xs" disabled={saving}>
                            Save
                          </Button>
                        </div>
                      </form>
                      <form action={remove} className="mt-1">
                        <input type="hidden" name="definitionId" value={f.id} />
                        <Button type="submit" size="xs" variant="destructive" disabled={deleting}>
                          Delete field
                        </Button>
                        {f.valueCount > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {f.valueCount} values recorded — deletion will be refused
                          </span>
                        )}
                      </form>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={f.id}>
                    <TableCell>{f.sortOrder}</TableCell>
                    <TableCell>
                      <div className="font-medium">{f.label}</div>
                      {f.options.length > 0 && (
                        <div className="text-xs text-muted-foreground">{f.options.join(" · ")}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{f.code}</TableCell>
                    <TableCell>
                      {f.dataType}
                      {f.unit ? ` (${f.unit})` : ""}
                    </TableCell>
                    <TableCell>{f.isRequired ? "Yes" : "No"}</TableCell>
                    <TableCell>{f.valueCount.toLocaleString("en-US")}</TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
