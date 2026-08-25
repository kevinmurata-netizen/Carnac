"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, FolderPlus, Check, X } from "lucide-react";
import {
  FIELD_LABELS,
  NUMERIC_FIELDS,
  TEXT_FIELDS,
  operatorsFor,
  operatorDef,
  fieldType,
  newCondition,
  emptyGroup,
  newTree,
  addToGroup,
  removeNode,
  updateCondition,
  setGroupJoin,
  describeNode,
  countConditions,
  evaluateTree,
  qualifies,
  type DecisionField,
  type DecisionTree,
  type DecisionInput,
  type Comparator,
  type Group,
  type Condition,
  type Trace,
  type QualifyMode,
} from "@/domain/waterline/decision-tree";

const control =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type Sample = { id: string; label: string; input: DecisionInput };

/**
 * Builds the rules that decide whether an asset qualifies for a treatment.
 *
 * The whole set for one treatment is edited together and saved in one go, so
 * what the page shows and what gates recommendations never drift apart. Every
 * edit is local until Save — nothing here changes a recommendation until you
 * press it.
 */
export function RuleBuilder({
  treatmentId,
  treatmentName,
  initialTrees,
  initialMode,
  samples,
  onSave,
  fieldOptions,
}: {
  treatmentId: string;
  treatmentName: string;
  initialTrees: DecisionTree[];
  initialMode: QualifyMode;
  samples: Sample[];
  onSave: (treatmentId: string, trees: DecisionTree[], mode: QualifyMode) => Promise<{ ok: boolean; message: string }>;
  /** Known values for the text fields, read from the live inventory. */
  fieldOptions: Partial<Record<DecisionField, string[]>>;
}) {
  const [trees, setTrees] = useState<DecisionTree[]>(initialTrees);
  const [mode, setMode] = useState<QualifyMode>(initialMode);
  const [sampleId, setSampleId] = useState(samples[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Baseline for the dirty check. Comparing serialised state is enough here —
  // trees are plain JSON, and this is exactly what gets written.
  const [saved, setSaved] = useState(() => JSON.stringify({ trees: initialTrees, mode: initialMode }));
  const current = JSON.stringify({ trees, mode });
  const dirty = current !== saved;

  const sample = samples.find((s) => s.id === sampleId) ?? null;
  const verdict = useMemo(
    () => (sample ? qualifies(trees, mode, sample.input) : null),
    [trees, mode, sample]
  );

  const patchTree = (treeId: string, patch: Partial<DecisionTree>) =>
    setTrees((all) => all.map((t) => (t.id === treeId ? { ...t, ...patch } : t)));

  const patchRoot = (treeId: string, fn: (root: Group) => Group) =>
    setTrees((all) => all.map((t) => (t.id === treeId ? { ...t, root: fn(t.root) } : t)));

  const save = async () => {
    setSaving(true);
    setResult(null);
    const outcome = await onSave(treatmentId, trees, mode);
    setResult(outcome);
    if (outcome.ok) setSaved(JSON.stringify({ trees, mode }));
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Decision trees for {treatmentName}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {trees.length === 0
                ? "No trees yet — this treatment is gated only by its condition, material and diameter window."
                : `${trees.length} tree${trees.length === 1 ? "" : "s"}, ${trees.filter((t) => t.enabled).length} active.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setTrees((all) => [...all, newTree(`Rule ${all.length + 1}`)])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add tree
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving || !dirty}>
              {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 border-t pt-4">
          {trees.filter((t) => t.enabled).length > 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">An asset qualifies when</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as QualifyMode)}
                aria-label="How the trees combine"
                className={control}
              >
                <option value="any">any one tree</option>
                <option value="all">every tree</option>
              </select>
              <span className="text-muted-foreground">matches.</span>
            </div>
          )}

          {result && (
            <p className={`text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}>{result.message}</p>
          )}
          {dirty && !saving && (
            <p className="text-xs text-muted-foreground">
              Unsaved. Nothing here affects recommendations until you save.
            </p>
          )}
        </CardContent>
      </Card>

      {trees.map((tree) => (
        <Card key={tree.id}>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                value={tree.name}
                onChange={(e) => patchTree(tree.id, { name: e.target.value })}
                aria-label="Tree name"
                placeholder="Name this rule"
                className="w-full max-w-sm rounded-md border border-input bg-background px-2 py-1 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                value={tree.description ?? ""}
                onChange={(e) => patchTree(tree.id, { description: e.target.value })}
                aria-label="Tree description"
                placeholder="Why this rule exists (optional)"
                className="w-full max-w-xl rounded-md border border-input bg-background px-2 py-1 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={tree.enabled ? "default" : "secondary"}>
                {countConditions(tree.root)} condition{countConditions(tree.root) === 1 ? "" : "s"}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => patchTree(tree.id, { enabled: !tree.enabled })}
              >
                {tree.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Delete ${tree.name}`}
                onClick={() => setTrees((all) => all.filter((t) => t.id !== tree.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 border-t pt-4">
            {!tree.enabled && (
              <p className="text-sm text-muted-foreground">
                Disabled — kept here but taking no part in qualification.
              </p>
            )}

            <GroupEditor
              group={tree.root}
              depth={0}
              fieldOptions={fieldOptions}
              onAddCondition={(groupId) => patchRoot(tree.id, (r) => addToGroup(r, groupId, newCondition()))}
              onAddGroup={(groupId) => patchRoot(tree.id, (r) => addToGroup(r, groupId, emptyGroup("OR")))}
              onRemove={(nodeId) => patchRoot(tree.id, (r) => removeNode(r, nodeId))}
              onPatch={(conditionId, patch) => patchRoot(tree.id, (r) => updateCondition(r, conditionId, patch))}
              onJoin={(groupId, join) => patchRoot(tree.id, (r) => setGroupJoin(r, groupId, join))}
            />

            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Reads as: </span>
              <span className="font-medium">
                Consider {treatmentName} when {describeNode(tree.root)}.
              </span>
            </div>

            {sample && (
              <TraceView outcome={evaluateTree(tree, sample.input)} />
            )}
          </CardContent>
        </Card>
      ))}

      {samples.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Try it against a real segment</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Live inventory, not an invented example — so a rule that looks right but excludes everything shows
              it here.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 border-t pt-4">
            <select
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
              aria-label="Segment to test against"
              className={`${control} w-full max-w-lg`}
            >
              {samples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>

            {verdict && (
              <div
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                  verdict.pass
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {verdict.pass ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {verdict.results.length === 0
                  ? "No active trees, so this segment is gated only by the technical window."
                  : verdict.pass
                    ? `Qualifies for ${treatmentName}.`
                    : `Does not qualify for ${treatmentName}.`}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** One group and everything under it. Nesting is drawn with an indent rule so
 * precedence is visible rather than inferred. */
function GroupEditor({
  group,
  depth,
  fieldOptions,
  onAddCondition,
  onAddGroup,
  onRemove,
  onPatch,
  onJoin,
}: {
  group: Group;
  depth: number;
  fieldOptions: Partial<Record<DecisionField, string[]>>;
  onAddCondition: (groupId: string) => void;
  onAddGroup: (groupId: string) => void;
  onRemove: (nodeId: string) => void;
  onPatch: (conditionId: string, patch: Partial<Condition>) => void;
  onJoin: (groupId: string, join: "AND" | "OR") => void;
}) {
  return (
    <div className={depth > 0 ? "rounded-md border border-dashed bg-muted/30 p-3" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={group.join}
          onChange={(e) => onJoin(group.id, e.target.value as "AND" | "OR")}
          aria-label="Join conditions with"
          className={`${control} w-28 font-medium`}
        >
          <option value="AND">Match all</option>
          <option value="OR">Match any</option>
        </select>
        <span className="text-xs text-muted-foreground">
          {group.join === "AND" ? "every condition below must hold" : "at least one condition below must hold"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => onAddCondition(group.id)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Condition
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onAddGroup(group.id)}>
            <FolderPlus className="mr-1 h-3.5 w-3.5" />
            Group
          </Button>
          {depth > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Remove group"
              onClick={() => onRemove(group.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {group.children.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Empty — an empty group constrains nothing, so it lets every asset through.
        </p>
      ) : (
        <ul className="mt-2 space-y-2 border-l-2 border-muted pl-3">
          {group.children.map((child) => (
            <li key={child.id}>
              {child.kind === "group" ? (
                <GroupEditor
                  group={child}
                  depth={depth + 1}
                  fieldOptions={fieldOptions}
                  onAddCondition={onAddCondition}
                  onAddGroup={onAddGroup}
                  onRemove={onRemove}
                  onPatch={onPatch}
                  onJoin={onJoin}
                />
              ) : (
                <ConditionRow
                  condition={child}
                  options={fieldOptions[child.field] ?? []}
                  onPatch={onPatch}
                  onRemove={onRemove}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConditionRow({
  condition,
  options,
  onPatch,
  onRemove,
}: {
  condition: Condition;
  options: string[];
  onPatch: (conditionId: string, patch: Partial<Condition>) => void;
  onRemove: (nodeId: string) => void;
}) {
  const operators = operatorsFor(condition.field);
  const def = operatorDef(condition.operator);
  const valueCount = def?.values ?? 1;
  const isText = fieldType(condition.field) === "text";
  // "is one of" takes a list, which a single-select cannot express.
  const asList = condition.operator === "in" || condition.operator === "notIn";

  const changeField = (field: DecisionField) => {
    // Keep the operator when the new field still supports it; otherwise fall
    // back to one it does, so the row never sits in an impossible state.
    const stillValid = operatorsFor(field).some((o) => o.key === condition.operator);
    onPatch(condition.id, {
      field,
      operator: stillValid ? condition.operator : (fieldType(field) === "number" ? "lt" : "eq"),
      value: "",
      value2: "",
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card px-2 py-2">
      <select
        value={condition.field}
        onChange={(e) => changeField(e.target.value as DecisionField)}
        aria-label="Field"
        className={`${control} w-48`}
      >
        <optgroup label="Numeric">
          {NUMERIC_FIELDS.map((f) => (
            <option key={f} value={f}>
              {FIELD_LABELS[f]}
            </option>
          ))}
        </optgroup>
        <optgroup label="Text">
          {TEXT_FIELDS.map((f) => (
            <option key={f} value={f}>
              {FIELD_LABELS[f]}
            </option>
          ))}
        </optgroup>
      </select>

      <select
        value={condition.operator}
        onChange={(e) => onPatch(condition.id, { operator: e.target.value as Comparator })}
        aria-label="Operator"
        className={`${control} w-40`}
      >
        {operators.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>

      {valueCount > 0 &&
        (isText && options.length > 0 && !asList ? (
          <select
            value={condition.value ?? ""}
            onChange={(e) => onPatch(condition.id, { value: e.target.value })}
            aria-label="Value"
            className={`${control} w-44`}
          >
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={condition.value ?? ""}
            onChange={(e) => onPatch(condition.id, { value: e.target.value })}
            type={isText || asList ? "text" : "number"}
            step="any"
            aria-label="Value"
            placeholder={asList ? (options.length ? options.slice(0, 2).join(", ") : "a, b, c") : "value"}
            className={`${control} ${asList ? "w-56" : "w-28"}`}
          />
        ))}

      {valueCount === 2 && (
        <>
          <span className="text-xs text-muted-foreground">and</span>
          <input
            value={condition.value2 ?? ""}
            onChange={(e) => onPatch(condition.id, { value2: e.target.value })}
            type="number"
            step="any"
            aria-label="Upper value"
            placeholder="value"
            className={`${control} w-28`}
          />
        </>
      )}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label="Remove condition"
        className="ml-auto"
        onClick={() => onRemove(condition.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** The trace, indented to match the rule's shape. §32 requires a
 * recommendation be explainable; this is that explanation. */
function TraceView({ outcome }: { outcome: { pass: boolean; trace: Trace } }) {
  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">
        {outcome.pass ? "Matches this segment" : "Does not match this segment"}
      </summary>
      <div className="mt-2">
        <TraceLine trace={outcome.trace} />
      </div>
    </details>
  );
}

function TraceLine({ trace }: { trace: Trace }) {
  return (
    <div className="border-l-2 border-muted pl-3">
      <p className={trace.pass ? "text-emerald-600" : "text-muted-foreground"}>
        {trace.pass ? "✓" : "✗"} {trace.label}
        {trace.observed != null && <span className="text-muted-foreground"> — segment has {trace.observed}</span>}
      </p>
      {trace.children?.map((child, i) => (
        <TraceLine key={i} trace={child} />
      ))}
    </div>
  );
}
