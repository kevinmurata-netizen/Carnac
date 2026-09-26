"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { ActiveToggle } from "@/components/settings/active-toggle";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import type { SettingsActionState } from "../state";
import type { AssetTypeDetail, AttributeDetail } from "@/server/settings";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type State = SettingsActionState;
const EMPTY: State = { status: "idle", message: null };
type Action = (prev: State, form: FormData) => Promise<State>;

/** Listed here rather than imported from the server module, which would drag
 * Prisma into the browser bundle for the sake of five strings. */
const DATA_TYPES = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "ENUM"] as const;

type TypeDraft = { id: string; code: string; name: string; description: string };
type AttributeDraft = {
  id: string;
  assetTypeId: string;
  assetTypeName: string;
  code: string;
  label: string;
  dataType: string;
  unit: string;
  isRequired: boolean;
  sortOrder: number;
  options: string;
  help: string;
};
type TemplateDraft = { assetTypeId: string; assetTypeName: string; name: string; description: string };

function Feedback({ state }: { state: State }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        error
          ? "border-destructive/40 bg-destructive/5"
          : "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
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
 * What is stopping the dialog being saved, said before the attempt.
 *
 * A save button that simply does nothing is the complaint this answers: the
 * form now names the empty field instead of leaving it to be guessed.
 */
function Missing({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {fields.length === 1 ? `${fields[0]} is required.` : `${fields.slice(0, -1).join(", ")} and ${fields.at(-1)} are required.`}
    </p>
  );
}

export function AssetTypeList({
  types,
  canEdit,
  canEditTemplates,
  onSaveType,
  onCreateType,
  onCreateAttribute,
  onSaveAttribute,
  onDeleteAttribute,
  onCreateTemplate,
  onToggleTemplate,
}: {
  types: AssetTypeDetail[];
  canEdit: boolean;
  /** Templates are their own card, so a role may be able to change types
   * without being allowed to add forms. */
  canEditTemplates: boolean;
  onSaveType: Action;
  onCreateType: Action;
  onCreateAttribute: Action;
  onSaveAttribute: Action;
  onDeleteAttribute: Action;
  onCreateTemplate: Action;
  onToggleTemplate: (id: string, next: boolean) => Promise<string>;
}) {
  const [state, setState] = useState<State>(EMPTY);
  const [pending, startTransition] = useTransition();

  const [editingType, setEditingType] = useState<TypeDraft | null>(null);
  const [editingAttribute, setEditingAttribute] = useState<AttributeDraft | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<TemplateDraft | null>(null);

  /** Saving is driven by hand rather than through useActionState so a save that
   * worked can close the dialog in the same breath — a dialog left open with
   * what was just saved still in it reads as "nothing happened". */
  const submit = (action: Action, formData: FormData, close: () => void) =>
    startTransition(async () => {
      const result = await action(EMPTY, formData);
      setState(result);
      if (result.status === "success") close();
    });

  return (
    <div className="space-y-4">
      <Feedback state={state} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          Asset Types <span className="text-muted-foreground">({types.length})</span>
        </h2>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            onClick={() => setEditingType({ id: "", code: "", name: "", description: "" })}
          >
            <Plus className="mr-1 h-4 w-4" />
            New asset type
          </Button>
        )}
      </div>

      {types.map((type) => (
        <Card key={type.id}>
          {/* `flex` rather than only `flex-row`: CardHeader is a grid by
              default, and tailwind-merge keeps the later display utility. */}
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <CardTitle className="text-base">{type.name}</CardTitle>
              <Badge variant="secondary" className="font-mono">
                {type.code}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatNumber(type.assetCount)} records</span>
            </div>
            {canEdit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() =>
                  setEditingType({
                    id: type.id,
                    code: type.code,
                    name: type.name,
                    description: type.description ?? "",
                  })
                }
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </CardHeader>

          <CardContent className="space-y-5">
            {type.description && <p className="text-sm text-muted-foreground">{type.description}</p>}

            {/* Attributes ---------------------------------------------- */}
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <Tags className="h-4 w-4 text-muted-foreground" />
                  Attributes <span className="text-muted-foreground">({type.attributes.length})</span>
                </h3>
                {canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditingAttribute({
                        id: "",
                        assetTypeId: type.id,
                        assetTypeName: type.name,
                        code: "",
                        label: "",
                        dataType: "TEXT",
                        unit: "",
                        isRequired: false,
                        sortOrder: 0,
                        options: "",
                        help: "",
                      })
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add attribute
                  </Button>
                )}
              </div>

              {type.attributes.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  None yet. {type.name} can hold no information until it has attributes — nothing on an asset of
                  this type would have anywhere to go.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableCell className="font-medium">Attribute</TableCell>
                        <TableCell className="font-medium">Code</TableCell>
                        <TableCell className="font-medium">Type</TableCell>
                        <TableCell className="font-medium">Unit</TableCell>
                        <TableCell className="font-medium">Required</TableCell>
                        <TableCell className="font-medium">Recorded</TableCell>
                        {canEdit && <TableCell className="w-20" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {type.attributes.map((attribute) => (
                        <AttributeRow
                          key={attribute.id}
                          attribute={attribute}
                          canEdit={canEdit}
                          onEdit={() =>
                            setEditingAttribute({
                              id: attribute.id,
                              assetTypeId: type.id,
                              assetTypeName: type.name,
                              code: attribute.code,
                              label: attribute.label,
                              dataType: attribute.dataType,
                              unit: attribute.unit ?? "",
                              isRequired: attribute.isRequired,
                              sortOrder: attribute.sortOrder,
                              options: attribute.options.join(", "),
                              help: attribute.help ?? "",
                            })
                          }
                          onDelete={(formData) => submit(onDeleteAttribute, formData, () => {})}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            {/* Inspection templates ------------------------------------ */}
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  Inspection Templates <span className="text-muted-foreground">({type.templates.length})</span>
                </h3>
                {canEditTemplates && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setEditingTemplate({
                        assetTypeId: type.id,
                        assetTypeName: type.name,
                        name: "",
                        description: "",
                      })
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add template
                  </Button>
                )}
              </div>

              {type.templates.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  No form for {type.name} yet, so nothing of this type can be inspected in the field.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {type.templates.map((template) => (
                    <li key={template.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{template.name}</span>
                          <ActiveToggle
                            id={template.id}
                            isActive={template.isActive}
                            action={onToggleTemplate}
                            readOnly={!canEditTemplates}
                            activeHint="Click to deactivate — this form stops being offered for new inspections"
                            inactiveHint="Click to activate — this form can be used for new inspections again"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatNumber(template.fieldCount)} question{template.fieldCount === 1 ? "" : "s"} ·{" "}
                          {formatNumber(template.inspectionCount)} inspection
                          {template.inspectionCount === 1 ? "" : "s"} recorded
                        </p>
                      </div>
                      <Link
                        href="/settings/inspection-templates"
                        className="text-xs text-primary hover:underline"
                      >
                        Edit form →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </CardContent>
        </Card>
      ))}

      {/* The asset type itself ------------------------------------------- */}
      {canEdit && (
        <EditorDialog
          open={editingType != null}
          onClose={() => setEditingType(null)}
          title={editingType?.id ? `Edit ${editingType.name}` : "New asset type"}
          description={
            editingType?.id
              ? "The display name and description are what the app shows. The code is fixed once the type exists."
              : "A kind of asset this utility holds — a reservoir, a well, a pump station. It records nothing until it has attributes, which are added on the type itself."
          }
        >
          {editingType && (
            <TypeForm
              draft={editingType}
              pending={pending}
              onSubmit={(formData) =>
                submit(editingType.id ? onSaveType : onCreateType, formData, () => setEditingType(null))
              }
              onCancel={() => setEditingType(null)}
            />
          )}
        </EditorDialog>
      )}

      {/* An attribute ---------------------------------------------------- */}
      {canEdit && (
        <EditorDialog
          open={editingAttribute != null}
          onClose={() => setEditingAttribute(null)}
          title={
            editingAttribute?.id
              ? `Edit ${editingAttribute.label}`
              : `New attribute on ${editingAttribute?.assetTypeName ?? ""}`
          }
          description="What this kind of asset records. The code identifies it to imports and to the model; the label is what people read."
        >
          {editingAttribute && (
            <AttributeForm
              draft={editingAttribute}
              pending={pending}
              onSubmit={(formData) =>
                submit(editingAttribute.id ? onSaveAttribute : onCreateAttribute, formData, () =>
                  setEditingAttribute(null)
                )
              }
              onCancel={() => setEditingAttribute(null)}
            />
          )}
        </EditorDialog>
      )}

      {/* An inspection template ------------------------------------------ */}
      {canEditTemplates && (
        <EditorDialog
          open={editingTemplate != null}
          onClose={() => setEditingTemplate(null)}
          title={`New inspection template for ${editingTemplate?.assetTypeName ?? ""}`}
          description="The form an inspector fills in for this kind of asset. It starts with no questions — those are added under Administration → Fields."
        >
          {editingTemplate && (
            <TemplateForm
              draft={editingTemplate}
              pending={pending}
              onSubmit={(formData) => submit(onCreateTemplate, formData, () => setEditingTemplate(null))}
              onCancel={() => setEditingTemplate(null)}
            />
          )}
        </EditorDialog>
      )}
    </div>
  );
}

function AttributeRow({
  attribute,
  canEdit,
  onEdit,
  onDelete,
}: {
  attribute: AttributeDetail;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: (formData: FormData) => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{attribute.label}</span>
        {attribute.options.length > 0 && (
          <span className="block text-xs text-muted-foreground">{attribute.options.join(" · ")}</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{attribute.code}</TableCell>
      <TableCell className="text-sm">{attribute.dataType}</TableCell>
      <TableCell className="text-sm">{attribute.unit ?? "—"}</TableCell>
      <TableCell className="text-sm">{attribute.isRequired ? "Yes" : "—"}</TableCell>
      <TableCell className="tabular-nums text-sm">{formatNumber(attribute.valueCount)}</TableCell>
      {canEdit && (
        <TableCell>
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${attribute.label}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <form
              action={(formData) => {
                formData.set("id", attribute.id);
                onDelete(formData);
              }}
            >
              <ConfirmDelete
                variant="ghost"
                ariaLabel={`Delete ${attribute.label}`}
                title={`Delete the attribute “${attribute.label}”?`}
                description={
                  attribute.valueCount > 0
                    ? `${formatNumber(attribute.valueCount)} asset(s) have a value recorded here, so deletion will be refused. Clear those values first if removal is genuinely intended.`
                    : "Nothing has been recorded against it, so nothing is lost. This cannot be undone."
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </ConfirmDelete>
            </form>
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

function TypeForm({
  draft,
  pending,
  onSubmit,
  onCancel,
}: {
  draft: TypeDraft;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(draft.code);
  const [name, setName] = useState(draft.name);
  const missing = [!name.trim() ? "A display name" : null, !draft.id && !code.trim() ? "a code" : null].filter(
    (v): v is string => v != null
  );

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="id" value={draft.id} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="type-code">Code</Label>
          <input
            id="type-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={draft.id !== ""}
            placeholder="e.g. SEWER_MAIN"
            className={`${input} font-mono disabled:opacity-60`}
          />
          <p className="text-xs text-muted-foreground">
            {draft.id
              ? "Fixed. Every server query selects on it, so changing it would detach this data from the logic that reads it."
              : "Capitals and underscores. This is what imports and the model refer to, and it cannot be changed later."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type-name">Display Name</Label>
          <input
            id="type-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sewer Main"
            className={input}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="type-description">Description</Label>
        <input
          id="type-description"
          name="description"
          defaultValue={draft.description}
          placeholder="What this kind of asset is"
          className={input}
        />
      </div>
      <Missing fields={missing} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || missing.length > 0}>
          {pending ? "Saving…" : draft.id ? "Save type" : "Add type"}
        </Button>
      </div>
    </form>
  );
}

function AttributeForm({
  draft,
  pending,
  onSubmit,
  onCancel,
}: {
  draft: AttributeDraft;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(draft.code);
  const [label, setLabel] = useState(draft.label);
  const [dataType, setDataType] = useState(draft.dataType);
  const [options, setOptions] = useState(draft.options);

  const missing = [
    !label.trim() ? "A label" : null,
    !draft.id && !code.trim() ? "a code" : null,
    dataType === "ENUM" && !options.trim() ? "at least one option" : null,
  ].filter((v): v is string => v != null);

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="id" value={draft.id} />
      <input type="hidden" name="assetTypeId" value={draft.assetTypeId} />
      <input type="hidden" name="sortOrder" value={draft.sortOrder} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="attr-label">Label</Label>
          <input
            id="attr-label"
            name="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Capacity"
            className={input}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attr-code">Code</Label>
          <input
            id="attr-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={draft.id !== ""}
            placeholder="e.g. CAPACITY_MG"
            className={`${input} font-mono disabled:opacity-60`}
          />
          <p className="text-xs text-muted-foreground">
            {draft.id ? "Fixed — imports and recorded values refer to it." : "Capitals and underscores; spaces become underscores."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="attr-type">Data Type</Label>
          <select
            id="attr-type"
            name="dataType"
            value={dataType}
            onChange={(e) => setDataType(e.target.value)}
            disabled={draft.id !== ""}
            className={`${input} disabled:opacity-60`}
          >
            {DATA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attr-unit">Unit</Label>
          <input
            id="attr-unit"
            name="unit"
            defaultValue={draft.unit}
            placeholder="e.g. ft, MG, $"
            className={input}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attr-required">Required</Label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              id="attr-required"
              name="isRequired"
              type="checkbox"
              defaultChecked={draft.isRequired}
              className="h-4 w-4"
            />
            Must be filled in
          </label>
        </div>
      </div>

      {dataType === "ENUM" && (
        <div className="space-y-1.5">
          <Label htmlFor="attr-options">Options</Label>
          <input
            id="attr-options"
            name="options"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            placeholder="Concrete, Steel, Prestressed Concrete"
            className={input}
          />
          <p className="text-xs text-muted-foreground">Comma separated. These are the only values accepted.</p>
        </div>
      )}

      {!draft.id && (
        <div className="space-y-1.5">
          <Label htmlFor="attr-help">Note</Label>
          <input
            id="attr-help"
            name="help"
            defaultValue={draft.help}
            placeholder="What this means, or where the figure comes from"
            className={input}
          />
        </div>
      )}

      <Missing fields={missing} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || missing.length > 0}>
          {pending ? "Saving…" : draft.id ? "Save attribute" : "Add attribute"}
        </Button>
      </div>
    </form>
  );
}

function TemplateForm({
  draft,
  pending,
  onSubmit,
  onCancel,
}: {
  draft: TemplateDraft;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(draft.name);

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="assetTypeId" value={draft.assetTypeId} />
      <div className="space-y-1.5">
        <Label htmlFor="template-name">Name</Label>
        <input
          id="template-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`e.g. ${draft.assetTypeName} Condition Assessment`}
          className={input}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="template-description">Description</Label>
        <input
          id="template-description"
          name="description"
          defaultValue={draft.description}
          placeholder="When this form is used"
          className={input}
        />
      </div>
      <Missing fields={name.trim() ? [] : ["A name"]} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : "Add template"}
        </Button>
      </div>
    </form>
  );
}
