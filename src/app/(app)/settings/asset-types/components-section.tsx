"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, ChevronDown, ChevronUp, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import {
  COMPONENT_ATTRIBUTE_KINDS,
  attributeKey,
  kindLabel,
  type ComponentAttribute,
  type ComponentAttributeKind,
} from "@/domain/components/attributes";
import type { ComponentLinkDetail, ComponentTypeOption } from "@/server/component-types";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Submit = (formData: FormData, close: () => void) => void;

type Editing = { mode: "add" } | { mode: "edit"; link: ComponentLinkDetail };

/** One decimal at most: shares are typed as whole percentages, but a split of
 * three can leave 33.3. */
function pct(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

function describeAttributes(attributes: ComponentAttribute[]) {
  return attributes.length === 0 ? "Nothing yet" : attributes.map((a) => a.label).join(" · ");
}

/**
 * What an asset type is made of, on the asset type's own card.
 *
 * The share is the one thing here that moves a score: it is how much of the
 * asset each part stands for when the roll-up weighs them. So the section
 * says what the shares add up to, and what the roll-up does when some are
 * missing, rather than leaving it to be discovered from a score.
 */
export function ComponentsSection({
  assetType,
  links,
  componentTypes,
  canEdit,
  pending,
  dialogError,
  onOpenDialog,
  onAdd,
  onSave,
  onRemove,
  onMove,
}: {
  assetType: { id: string; name: string };
  links: ComponentLinkDetail[];
  componentTypes: ComponentTypeOption[];
  canEdit: boolean;
  pending: boolean;
  /** A refused save, shown inside the open dialog. */
  dialogError: ReactNode;
  onOpenDialog: () => void;
  onAdd: Submit;
  onSave: Submit;
  onRemove: (formData: FormData) => void;
  onMove: (componentTypeId: string, direction: -1 | 1) => void;
}) {
  const [editing, setEditingState] = useState<Editing | null>(null);
  const setEditing = (next: Editing | null) => {
    if (next) onOpenDialog();
    setEditingState(next);
  };

  const linkedIds = new Set(links.map((l) => l.componentTypeId));
  const available = componentTypes.filter((t) => !linkedIds.has(t.id));
  const shares = links.map((l) => l.sharePct);
  const unshared = links.filter((l) => l.sharePct == null);
  const total = shares.reduce<number>((s, v) => s + (v ?? 0), 0);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          Components <span className="text-muted-foreground">({links.length})</span>
        </h3>
        {canEdit && (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ mode: "add" })}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add component
          </Button>
        )}
      </div>

      {links.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
          None. {assetType.name} is scored as a whole. Add the parts it is made of to track each one on its own and
          roll their scores up into the asset&apos;s.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell className="font-medium">Component</TableCell>
                  <TableCell className="text-right font-medium">Share of value</TableCell>
                  <TableCell className="font-medium">Consequence</TableCell>
                  <TableCell className="font-medium">Records</TableCell>
                  <TableCell className="text-right font-medium">On assets</TableCell>
                  {canEdit && <TableCell className="w-36" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link, i) => (
                  <TableRow key={link.componentTypeId}>
                    <TableCell>
                      <span className="font-medium">{link.name}</span>
                      {link.description && (
                        <span className="block text-xs text-muted-foreground">{link.description}</span>
                      )}
                      {link.alsoOn.length > 0 && (
                        <span className="block text-xs text-muted-foreground">Also on {link.alsoOn.join(", ")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {link.sharePct == null ? <span className="text-muted-foreground">—</span> : pct(link.sharePct)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {link.consequence == null ? (
                        <span className="text-muted-foreground">Not set</span>
                      ) : (
                        `${link.consequence} · ${CONSEQUENCES[link.consequence - 1]}`
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{describeAttributes(link.attributes)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatNumber(link.componentCount)}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending || i === 0}
                            onClick={() => onMove(link.componentTypeId, -1)}
                            aria-label={`Move ${link.name} up`}
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={pending || i === links.length - 1}
                            onClick={() => onMove(link.componentTypeId, 1)}
                            aria-label={`Move ${link.name} down`}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing({ mode: "edit", link })}
                            aria-label={`Edit ${link.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <ConfirmDelete
                            variant="ghost"
                            ariaLabel={`Remove ${link.name}`}
                            title={`Remove ${link.name} from ${assetType.name}?`}
                            confirmLabel="Remove"
                            description={
                              link.componentCount > 0
                                ? `${formatNumber(link.componentCount)} ${assetType.name} component${
                                    link.componentCount === 1 ? " is a" : "s are"
                                  } ${link.name}, so removal will be refused. Remove those from their assets first.`
                                : link.alsoOn.length > 0
                                  ? `No ${assetType.name} has one recorded, so nothing is lost. ${link.name} stays a component of ${link.alsoOn.join(", ")}.`
                                  : `No ${assetType.name} has one recorded, and nothing else uses ${link.name}, so it is deleted entirely. This cannot be undone.`
                            }
                            onConfirm={() => {
                              const formData = new FormData();
                              formData.set("assetTypeId", assetType.id);
                              formData.set("componentTypeId", link.componentTypeId);
                              onRemove(formData);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </ConfirmDelete>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ShareSummary assetTypeName={assetType.name} total={total} unshared={unshared.map((l) => l.name)} />
          {links.some((l) => l.consequence == null) && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                {links
                  .filter((l) => l.consequence == null)
                  .map((l) => l.name)
                  .join(", ")}{" "}
                {links.filter((l) => l.consequence == null).length === 1 ? "has" : "have"} no consequence of failure,
                so inspecting {links.filter((l) => l.consequence == null).length === 1 ? "it" : "them"} records
                condition but no risk.
              </span>
            </p>
          )}
        </>
      )}

      {canEdit && (
        <EditorDialog
          open={editing != null}
          onClose={() => setEditing(null)}
          title={
            editing?.mode === "edit" ? `Edit ${editing.link.name} on ${assetType.name}` : `Add a component to ${assetType.name}`
          }
          description={
            editing?.mode === "edit"
              ? "The share and consequence belong to this asset type. The name, description and what it records belong to the component itself."
              : "One of the parts this kind of asset is made of. Adding it here says what every asset of the type consists of; each asset's own components are recorded on the asset."
          }
        >
          {dialogError}
          {editing?.mode === "add" && (
            <AddComponentForm
              assetTypeId={assetType.id}
              available={available}
              remaining={Math.max(0, 100 - total)}
              pending={pending}
              onSubmit={(formData) => onAdd(formData, () => setEditing(null))}
              onCancel={() => setEditing(null)}
            />
          )}
          {editing?.mode === "edit" && (
            <EditComponentForm
              assetTypeId={assetType.id}
              assetTypeName={assetType.name}
              link={editing.link}
              pending={pending}
              onSubmit={(formData) => onSave(formData, () => setEditing(null))}
              onCancel={() => setEditing(null)}
            />
          )}
        </EditorDialog>
      )}
    </section>
  );
}

/**
 * What the roll-up will make of these shares. They are relative — scaled to
 * 100% when scoring — but the roll-up only uses them when every component an
 * asset has carries one, so a gap changes how any asset with that part is weighed.
 */
function ShareSummary({
  assetTypeName,
  total,
  unshared,
}: {
  assetTypeName: string;
  total: number;
  unshared: string[];
}) {
  const settings = (
    <Link href="/settings/rollup" className="text-primary hover:underline">
      Component Roll-up
    </Link>
  );

  if (unshared.length > 0) {
    const none = total === 0;
    return (
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span>
          {none
            ? `No shares set, so a ${assetTypeName}'s components count equally in its score`
            : `${unshared.join(", ")} ${unshared.length === 1 ? "has" : "have"} no share, so a ${assetTypeName} with ${
                unshared.length === 1 ? "one" : "any of them"
              } has its components counted equally in its score`}
          , unless each has its own replacement cost. How shares are used is set under {settings}.
        </span>
      </p>
    );
  }

  const exact = Math.abs(total - 100) < 0.05;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {exact
        ? "Shares add to 100%."
        : `Shares add to ${pct(total)} — scoring scales them to 100%, so each counts in proportion to the total.`}{" "}
      A component&apos;s own replacement cost, where every component of an asset has one, takes their place. How shares
      are used is set under {settings}.
    </p>
  );
}

type AttributeDraft = { id: number; label: string; kind: ComponentAttributeKind; options: string };

function toNewAttributes(rows: AttributeDraft[]) {
  return rows.map((r) => ({
    label: r.label.trim(),
    kind: r.kind,
    options: r.options
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  }));
}

/** Why the new attribute rows can't be saved yet, if they can't. */
function attributeProblems(rows: AttributeDraft[], takenKeys: string[]): string[] {
  const problems: string[] = [];
  const keys = new Set(takenKeys);
  for (const r of rows) {
    const label = r.label.trim();
    if (!label) {
      problems.push("a name for every new attribute");
      continue;
    }
    const key = attributeKey(label);
    if (!key) problems.push(`a letter or digit in "${label}"`);
    else if (keys.has(key)) problems.push(`a different name for "${label}", which is already used`);
    keys.add(key);
    if (r.kind === "choice" && !r.options.trim()) problems.push(`options for "${label}"`);
  }
  return [...new Set(problems)];
}

function AttributeRows({
  rows,
  onChange,
}: {
  rows: AttributeDraft[];
  onChange: (rows: AttributeDraft[]) => void;
}) {
  const update = (id: number, patch: Partial<AttributeDraft>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_1fr_auto]">
          <input
            aria-label="Attribute name"
            value={r.label}
            onChange={(e) => update(r.id, { label: e.target.value })}
            placeholder="e.g. Wall thickness (in)"
            className={input}
          />
          <select
            aria-label="Kind"
            value={r.kind}
            onChange={(e) => update(r.id, { kind: e.target.value as ComponentAttributeKind })}
            className={input}
          >
            {COMPONENT_ATTRIBUTE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          {r.kind === "choice" ? (
            <input
              aria-label="Options"
              value={r.options}
              onChange={(e) => update(r.id, { options: e.target.value })}
              placeholder="Options, comma separated"
              className={input}
            />
          ) : (
            <span className="hidden sm:block" />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
            aria-label="Remove this attribute"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { id: Date.now(), label: "", kind: "text", options: "" }])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add attribute
      </Button>
    </div>
  );
}

/** The usual five-point scale, worded so a number is never chosen blind. */
const CONSEQUENCES = ["Negligible", "Minor", "Moderate", "Major", "Severe"];

function ConsequenceField({ defaultValue }: { defaultValue: number | null }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="component-consequence">Consequence of failure</Label>
      <select
        id="component-consequence"
        name="consequence"
        defaultValue={defaultValue == null ? "" : String(defaultValue)}
        className={input}
      >
        <option value="">Not set</option>
        {CONSEQUENCES.map((label, i) => (
          <option key={label} value={i + 1}>
            {i + 1} · {label}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        How much this part failing matters on this kind of asset. A component inspection&apos;s risk is the
        probability its condition implies × this; without it, inspections record condition only.
      </p>
    </div>
  );
}

function ShareField({ defaultValue, remaining }: { defaultValue: string; remaining?: number }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="component-share">Share of the asset&apos;s value (%)</Label>
      <input
        id="component-share"
        name="sharePct"
        type="number"
        min={0.1}
        max={100}
        step="any"
        defaultValue={defaultValue}
        placeholder={remaining != null && remaining > 0 ? `${Math.round(remaining * 10) / 10} unallocated` : "e.g. 15"}
        className={`${input} tabular-nums`}
      />
      <p className="text-xs text-muted-foreground">
        What this part stands for when the asset&apos;s score is rolled up from its components — roughly its share
        of what the asset costs to replace. Leave blank if unknown.
      </p>
    </div>
  );
}

function Missing({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Still needed: {items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`}.
    </p>
  );
}

function AddComponentForm({
  assetTypeId,
  available,
  remaining,
  pending,
  onSubmit,
  onCancel,
}: {
  assetTypeId: string;
  available: ComponentTypeOption[];
  remaining: number;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"existing" | "new">(available.length > 0 ? "existing" : "new");
  const [componentTypeId, setComponentTypeId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rows, setRows] = useState<AttributeDraft[]>([]);

  const chosen = available.find((t) => t.id === componentTypeId);
  const derivedCode = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  const missing =
    mode === "existing"
      ? chosen
        ? []
        : ["a component to add"]
      : [...(name.trim() ? [] : ["a name"]), ...attributeProblems(rows, [])];

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="assetTypeId" value={assetTypeId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="attributes" value={JSON.stringify(toNewAttributes(rows))} />

      {available.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Which component">
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} />
            One already defined
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} />
            A new kind of component
          </label>
        </div>
      )}

      {mode === "existing" ? (
        <div className="space-y-1.5">
          <Label htmlFor="component-existing">Component</Label>
          <select
            id="component-existing"
            name="componentTypeId"
            value={componentTypeId}
            onChange={(e) => setComponentTypeId(e.target.value)}
            className={input}
          >
            <option value="">Choose…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.usedBy.length > 0 ? ` — on ${t.usedBy.join(", ")}` : ""}
              </option>
            ))}
          </select>
          {chosen && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {chosen.description && <p>{chosen.description}</p>}
              <p>Records: {describeAttributes(chosen.attributes)}</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="component-name">Name</Label>
              <input
                id="component-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Overflow Pipe"
                className={input}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="component-code">Code</Label>
              <input
                id="component-code"
                name="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={derivedCode || "e.g. OVERFLOW_PIPE"}
                className={`${input} font-mono`}
              />
              <p className="text-xs text-muted-foreground">
                What imports refer to. Fixed once created; left blank, it is made from the name.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="component-description">Description</Label>
            <input
              id="component-description"
              name="description"
              placeholder="What this part is"
              className={input}
            />
          </div>
          <div className="space-y-1.5">
            <Label>What it records</Label>
            <p className="text-xs text-muted-foreground">
              Facts about each one — its material, make, size. Condition and risk are recorded for every component
              and need no attribute.
            </p>
            <AttributeRows rows={rows} onChange={setRows} />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ShareField defaultValue="" remaining={remaining} />
        <ConsequenceField defaultValue={null} />
      </div>

      <Missing items={missing} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || missing.length > 0}>
          {pending ? "Saving…" : "Add component"}
        </Button>
      </div>
    </form>
  );
}

function EditComponentForm({
  assetTypeId,
  assetTypeName,
  link,
  pending,
  onSubmit,
  onCancel,
}: {
  assetTypeId: string;
  assetTypeName: string;
  link: ComponentLinkDetail;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(link.name);
  const [removed, setRemoved] = useState<string[]>([]);
  const [rows, setRows] = useState<AttributeDraft[]>([]);

  const kept = link.attributes.filter((a) => !removed.includes(a.key)).map((a) => a.key);
  const missing = [...(name.trim() ? [] : ["a name"]), ...attributeProblems(rows, kept)];

  return (
    <form action={onSubmit} className="space-y-4">
      <input type="hidden" name="assetTypeId" value={assetTypeId} />
      <input type="hidden" name="componentTypeId" value={link.componentTypeId} />
      <input type="hidden" name="removeAttributes" value={JSON.stringify(removed)} />
      <input type="hidden" name="addAttributes" value={JSON.stringify(toNewAttributes(rows))} />

      {link.alsoOn.length > 0 && (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {link.name} is also a component of {link.alsoOn.join(", ")}. A change to its name, description or what it
          records applies there too; the share and consequence are {assetTypeName}&apos;s alone.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="component-name">Name</Label>
          <input
            id="component-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={input}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="component-code">Code</Label>
          <input
            id="component-code"
            value={link.code}
            disabled
            className={`${input} font-mono disabled:opacity-60`}
          />
          <p className="text-xs text-muted-foreground">Fixed — imports refer to it.</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="component-description">Description</Label>
        <input
          id="component-description"
          name="description"
          defaultValue={link.description ?? ""}
          placeholder="What this part is"
          className={input}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ShareField defaultValue={link.sharePct == null ? "" : String(link.sharePct)} />
        <ConsequenceField defaultValue={link.consequence} />
      </div>

      <div className="space-y-1.5">
        <Label>What it records</Label>
        {link.attributes.length > 0 && (
          <ul className="divide-y rounded-md border">
            {link.attributes.map((a) => {
              const gone = removed.includes(a.key);
              return (
                <li key={a.key} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <span className={gone ? "text-muted-foreground line-through" : undefined}>
                    {a.label}{" "}
                    <span className="text-xs text-muted-foreground">
                      {kindLabel(a.kind)}
                      {a.options.length > 0 ? ` — ${a.options.join(", ")}` : ""}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setRemoved(gone ? removed.filter((k) => k !== a.key) : [...removed, a.key])
                    }
                    aria-label={gone ? `Keep ${a.label}` : `Remove ${a.label}`}
                  >
                    {gone ? <Undo2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {removed.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Struck-through attributes are removed on save — refused for any a component already has a value for.
          </p>
        )}
        <AttributeRows rows={rows} onChange={setRows} />
      </div>

      <Missing items={missing} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || missing.length > 0}>
          {pending ? "Saving…" : "Save component"}
        </Button>
      </div>
    </form>
  );
}
