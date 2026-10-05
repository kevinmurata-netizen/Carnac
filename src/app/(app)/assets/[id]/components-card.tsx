"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber, toDateInputValue } from "@/lib/format";
import { formatComponentAttribute, type ComponentAttribute } from "@/domain/components/attributes";
import type { AssetRollup } from "@/server/rollup";
import type { AddableComponentType, ComponentHistory } from "@/server/components";
import type { LatestReadings } from "@/server/component-inspections";
import Link from "next/link";
import type { EditState } from "./actions";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Row = AssetRollup["components"][number];
type FormAction = (prev: EditState, formData: FormData) => Promise<EditState>;
type Editing = { mode: "add" } | { mode: "edit"; row: Row };

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

/** "Material Steel · Wall thickness (in) 0.375" — what has been recorded, in
 * the order the type lists it, skipping what hasn't. */
function recorded(row: Row): string | null {
  const parts = row.attributeDefs
    .map((a) => {
      const value = formatComponentAttribute(row.attributes[a.key]);
      return value == null ? null : `${a.label}: ${value}`;
    })
    .filter((v): v is string => v != null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function money(value: number | null) {
  return value == null ? "—" : `$${formatNumber(Math.round(value))}`;
}

/**
 * The components this asset is made of, and how their scores became the
 * asset's — which strategy, why that one, how much of the asset it covers and,
 * for a worst case, which component drove it. Laid out so the asset-level
 * number can be checked by hand from the rows beneath it.
 *
 * Which parts an asset has is recorded here, per asset: not every reservoir
 * has cathodic protection, and a pump station may have three pumps.
 */
export function ComponentsCard({
  assetId,
  rollup,
  addable,
  history,
  readings,
  canEdit,
  onAdd,
  onSave,
  onRemove,
}: {
  assetId: string;
  rollup: AssetRollup | undefined;
  addable: AddableComponentType[];
  history: Record<string, ComponentHistory>;
  /** What the latest inspection of each component measured. */
  readings: Record<string, LatestReadings>;
  canEdit: boolean;
  onAdd: FormAction;
  onSave: FormAction;
  onRemove: (componentId: string) => Promise<EditState>;
}) {
  const [state, setState] = useState<EditState>(EMPTY);
  const [editing, setEditingState] = useState<Editing | null>(null);
  const [pending, startTransition] = useTransition();

  const setEditing = (next: Editing | null) => {
    if (next) setState(EMPTY);
    setEditingState(next);
  };

  const rows = rollup?.components ?? [];
  const result = rollup?.result;
  const shareOf = new Map(result?.shares.map((s) => [s.componentId, s.share]) ?? []);
  const missing = addable.filter((t) => !rows.some((r) => r.componentTypeId === t.id));

  const submit = (action: FormAction, formData: FormData) =>
    startTransition(async () => {
      const next = await action(EMPTY, formData);
      setState(next);
      if (next.status === "success") setEditingState(null);
    });

  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>Components</CardTitle>
        {canEdit && addable.length > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ mode: "add" })}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add component
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing && <Feedback state={state} />}

        {result && result.scored > 0 ? (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium tabular-nums">
              Condition {result.condition.value ?? "—"} · Risk {result.risk.value ?? "—"}
            </span>{" "}
            <span className="text-muted-foreground">
              — {rollup?.strategy?.name} ({rollup?.strategy?.source}), from {result.scored} of {result.total} components,
              weighted by {result.weightBasis}.
              {result.driver &&
                ` Driven by ${result.driver.label}: ${Math.round(result.driver.share * 100)}% of the asset, pulling ${Math.round(
                  result.driver.pull * 100
                )}% of the way from the weighted average to its own score.`}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "No components recorded, so this asset is scored as a whole. Add the parts it has to score each one and roll them up."
              : "No component has been scored yet, so there is no asset score to roll up."}
          </p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Condition</TableHead>
                  <TableHead className="text-right">Risk</TableHead>
                  <TableHead>Installed</TableHead>
                  <TableHead className="text-right">Replacement cost</TableHead>
                  <TableHead>Scored</TableHead>
                  {canEdit && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const details = recorded(c);
                  const h = history[c.id] ?? { observations: 0, inspections: 0 };
                  return (
                    <TableRow key={c.id} className={result?.driver?.componentId === c.id ? "bg-amber-500/5" : undefined}>
                      <TableCell className="min-w-56">
                        <span className="font-medium">{c.label}</span>
                        {c.label !== c.componentTypeName && (
                          <span className="text-xs text-muted-foreground"> · {c.componentTypeName}</span>
                        )}
                        {details && <span className="block text-xs text-muted-foreground">{details}</span>}
                        {readings[c.id] && readings[c.id].readings.length > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            <Link
                              href={`/inspections/${readings[c.id].visitId ?? readings[c.id].inspectionId}`}
                              className="text-primary hover:underline"
                            >
                              {formatDate(readings[c.id].date)}
                            </Link>
                            : {readings[c.id].readings.map((r) => `${r.label} ${r.value}`).join(" · ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {shareOf.has(c.id) ? `${Math.round(shareOf.get(c.id)! * 1000) / 10}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.conditionScore ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.riskScore ?? "—"}</TableCell>
                      <TableCell className="text-sm">{formatDate(c.installationDate)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{money(c.replacementCost)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(c.scoresAsOf)}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditing({ mode: "edit", row: c })}
                              aria-label={`Edit ${c.label}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <ConfirmDelete
                              variant="ghost"
                              ariaLabel={`Remove ${c.label}`}
                              title={`Remove ${c.label} from this asset?`}
                              confirmLabel="Remove"
                              description={
                                h.observations + h.inspections === 0
                                  ? "Nothing has been recorded against it, so nothing else is lost."
                                  : `Everything recorded against it goes too — ${formatNumber(h.observations)} condition and risk reading${
                                      h.observations === 1 ? "" : "s"
                                    }${
                                      h.inspections > 0
                                        ? ` and ${formatNumber(h.inspections)} inspection record${h.inspections === 1 ? "" : "s"}`
                                        : ""
                                    } — and the asset's score is rolled up from the rest. This cannot be undone.`
                              }
                              onConfirm={() =>
                                startTransition(async () => {
                                  setState(await onRemove(c.id));
                                })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </ConfirmDelete>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {canEdit && rows.length > 0 && missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Not recorded on this asset: {missing.map((t) => t.name).join(", ")}. Add one if it has it.
          </p>
        )}
      </CardContent>

      {canEdit && (
        <EditorDialog
          open={editing != null}
          onClose={() => setEditingState(null)}
          title={editing?.mode === "edit" ? `Edit ${editing.row.label}` : "Add a component"}
          description={
            editing?.mode === "edit"
              ? "What is known about this part. Its condition and risk come from inspection."
              : "A part this asset has. It is unscored until it is inspected."
          }
        >
          {editing && <Feedback state={state} />}
          {editing && (
            <ComponentForm
              key={editing.mode === "edit" ? editing.row.id : "add"}
              assetId={assetId}
              editing={editing}
              addable={addable}
              pending={pending}
              onSubmit={(formData) => submit(editing.mode === "edit" ? onSave : onAdd, formData)}
              onCancel={() => setEditingState(null)}
            />
          )}
        </EditorDialog>
      )}
    </Card>
  );
}

function AttributeInput({ attribute, value }: { attribute: ComponentAttribute; value: unknown }) {
  const id = `component-attr-${attribute.key}`;
  const name = `attr:${attribute.key}`;
  const current = value == null ? "" : String(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{attribute.label}</Label>
      {attribute.kind === "choice" || attribute.kind === "boolean" ? (
        <select id={id} name={name} defaultValue={current} className={input}>
          <option value="">Not recorded</option>
          {(attribute.kind === "boolean" ? ["true", "false"] : attribute.options).map((o) => (
            <option key={o} value={o}>
              {attribute.kind === "boolean" ? (o === "true" ? "Yes" : "No") : o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          name={name}
          defaultValue={current}
          type={attribute.kind === "text" ? "text" : "number"}
          step={attribute.kind === "integer" ? 1 : "any"}
          className={`${input} ${attribute.kind === "text" ? "" : "tabular-nums"}`}
        />
      )}
    </div>
  );
}

function ComponentForm({
  assetId,
  editing,
  addable,
  pending,
  onSubmit,
  onCancel,
}: {
  assetId: string;
  editing: Editing;
  addable: AddableComponentType[];
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const row = editing.mode === "edit" ? editing.row : null;
  const [typeId, setTypeId] = useState(row?.componentTypeId ?? "");
  const type = addable.find((t) => t.id === typeId);
  const attributes = row?.attributeDefs ?? type?.attributes ?? [];

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="assetId" value={assetId} />
      {row && <input type="hidden" name="componentId" value={row.id} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {row ? (
          <div className="space-y-1.5">
            <Label>Component</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
              {row.componentTypeName}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="component-type">Component</Label>
            <select
              id="component-type"
              name="componentTypeId"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className={input}
            >
              <option value="">Choose…</option>
              {addable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {type?.description && <p className="text-xs text-muted-foreground">{type.description}</p>}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="component-label">Label</Label>
          <input
            id="component-label"
            name="label"
            defaultValue={row?.ownLabel ?? ""}
            placeholder={row?.componentTypeName ?? type?.name ?? "e.g. Pump 2"}
            className={input}
          />
          <p className="text-xs text-muted-foreground">
            Optional. Useful when there is more than one — a second one is numbered if left blank.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="component-installed">Installed</Label>
          <input
            id="component-installed"
            name="installationDate"
            type="date"
            defaultValue={toDateInputValue(row?.installationDate ?? null)}
            className={input}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="component-cost">Replacement cost ($)</Label>
          <input
            id="component-cost"
            name="replacementCost"
            type="number"
            min={0}
            step="any"
            defaultValue={row?.replacementCost ?? ""}
            className={`${input} tabular-nums`}
          />
          <p className="text-xs text-muted-foreground">
            When every component of this asset has one, the roll-up weighs them by it instead of the type&apos;s default
            shares.
          </p>
        </div>
      </div>

      {attributes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">What it is</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {attributes.map((a) => (
              <AttributeInput key={a.key} attribute={a} value={row?.attributes[a.key]} />
            ))}
          </div>
        </div>
      )}

      {!row && !type && <p className="text-xs text-muted-foreground">Still needed: a component to add.</p>}
      <div data-dialog-actions className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || (!row && !type)}>
          {pending ? "Saving…" : row ? "Save component" : "Add component"}
        </Button>
      </div>
    </form>
  );
}
