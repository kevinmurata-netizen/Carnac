"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X, Trash2 } from "lucide-react";
import {
  evaluateTree,
  describeNode,
  countConditions,
  addToGroup,
  removeNode,
  updateCondition,
  setGroupJoin,
  newCondition,
  emptyGroup,

  type DecisionField,
  type DecisionInput,
  type Group,
  type Rule,
  type RuleEffect,
} from "@/domain/waterline/decision-tree";
import { GroupEditor, TraceView, control } from "./condition-builder";

export type Sample = { id: string; label: string; input: DecisionInput };

export type RuleDraft = {
  /** Null while the rule has never been saved. */
  id: string | null;
  name: string;
  description: string;
  effect: RuleEffect;
  enabled: boolean;
  root: Group;
};


/**
 * Writes one rule.
 *
 * A rule belongs to the organization rather than to a treatment, so this
 * editor says nothing about which treatments use it — that is chosen on the
 * treatment, and shown here only as a consequence. Every edit is local until
 * Save: nothing here changes a recommendation until you press it.
 */
export function RuleEditor({
  initial,
  usedBy,
  isGenerated,
  samples,
  fieldOptions,
  onSave,
  onDelete,
}: {
  initial: RuleDraft;
  usedBy: string[];
  isGenerated: boolean;
  samples: Sample[];
  /** Known values for the text fields, read from the live inventory. */
  fieldOptions: Partial<Record<DecisionField, string[]>>;
  onSave: (draft: RuleDraft) => Promise<{ ok: boolean; message: string; id?: string }>;
  onDelete: (id: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<RuleDraft>(initial);
  const [sampleId, setSampleId] = useState(samples[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Comparing serialised state is enough: a draft is plain JSON, and this is
  // exactly what gets written.
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const dirty = JSON.stringify(draft) !== saved;

  const sample = samples.find((s) => s.id === sampleId) ?? null;
  const asRule: Rule = useMemo(
    () => ({ id: draft.id ?? "draft", name: draft.name, enabled: draft.enabled, effect: draft.effect, root: draft.root }),
    [draft]
  );
  const outcome = useMemo(() => (sample ? evaluateTree(asRule, sample.input) : null), [asRule, sample]);

  const patchRoot = (fn: (root: Group) => Group) => setDraft((d) => ({ ...d, root: fn(d.root) }));

  const save = async () => {
    setBusy(true);
    setResult(null);
    const outcome = await onSave(draft);
    setResult(outcome);
    if (outcome.ok) {
      setSaved(JSON.stringify(draft));
      // A rule that has just been created needs its own address, or Save
      // again would create a second one.
      if (!draft.id && outcome.id) router.replace(`/settings/decision-trees?rule=${outcome.id}`);
      else router.refresh();
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!draft.id) return;
    setBusy(true);
    setResult(null);
    const outcome = await onDelete(draft.id);
    setResult(outcome);
    if (outcome.ok) router.replace("/settings/decision-trees");
    setBusy(false);
  };

  const conditions = countConditions(draft.root);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 flex-1 space-y-2">
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              aria-label="Rule name"
              placeholder="Name this rule, e.g. Condition 0-30"
              className={`${control} w-full max-w-md font-medium`}
            />
            <input
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              aria-label="Rule description"
              placeholder="Why this rule exists (optional)"
              className={`${control} w-full max-w-lg`}
            />
          </div>
          <div className="flex items-center gap-2">
            {draft.id && (
              <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={busy} aria-label="Delete rule">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button type="button" size="sm" onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">An asset that matches this rule is</span>
            <select
              value={draft.effect}
              onChange={(e) => setDraft((d) => ({ ...d, effect: e.target.value as RuleEffect }))}
              aria-label="What a match means"
              className={control}
            >
              <option value="allow">allowed this treatment</option>
              <option value="block">refused this treatment</option>
            </select>
            <span className="text-muted-foreground">
              {draft.effect === "block"
                ? "— a block always applies, whatever the other rules say."
                : "— allow rules combine the way each treatment says they do."}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={draft.enabled ? "default" : "secondary"}>
              {conditions} condition{conditions === 1 ? "" : "s"}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
            >
              {draft.enabled ? "Disable" : "Enable"}
            </Button>
            {!draft.enabled && (
              <span className="text-sm text-muted-foreground">
                Disabled — kept, but taking no part in qualification anywhere.
              </span>
            )}
          </div>

          <GroupEditor
            group={draft.root}
            depth={0}
            fieldOptions={fieldOptions}
            onAddCondition={(groupId) => patchRoot((r) => addToGroup(r, groupId, newCondition()))}
            onAddGroup={(groupId) => patchRoot((r) => addToGroup(r, groupId, emptyGroup("OR")))}
            onRemove={(nodeId) => patchRoot((r) => removeNode(r, nodeId))}
            onPatch={(conditionId, patch) => patchRoot((r) => updateCondition(r, conditionId, patch))}
            onJoin={(groupId, join) => patchRoot((r) => setGroupJoin(r, groupId, join))}
          />

          {conditions > 0 && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              Reads as: <span className="font-medium">{describeNode(draft.root)}</span>.
            </p>
          )}

          {result && (
            <p className={`text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}>{result.message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where this rule is used</CardTitle>
        </CardHeader>
        <CardContent className="border-t pt-4 text-sm">
          {usedBy.length === 0 ? (
            <p className="text-muted-foreground">
              Not attached to any treatment yet, so it gates nothing. Attach it under Settings → Treatments, on the
              treatment it applies to.
            </p>
          ) : (
            <p>
              {usedBy.join(", ")}.{" "}
              <span className="text-muted-foreground">
                Editing this rule changes what all of them are considered for.
              </span>
            </p>
          )}
          {isGenerated && (
            <p className="mt-2 text-xs text-muted-foreground">
              Written by the migration from the condition, material and diameter limits this treatment used to carry.
              It is an ordinary rule — edit or delete it like any other.
            </p>
          )}
        </CardContent>
      </Card>

      {samples.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Try it against a real segment</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Live inventory, not an invented example — so a rule that looks right but matches nothing shows it here.
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

            {outcome && (
              <>
                <div
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                    outcome.pass === (draft.effect === "allow")
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {outcome.pass ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {conditions === 0
                    ? "No conditions yet, so this rule matches every segment."
                    : outcome.pass
                      ? draft.effect === "block"
                        ? "Matches — this segment would be refused."
                        : "Matches — this segment is allowed through."
                      : draft.effect === "block"
                        ? "No match — this rule would not refuse this segment."
                        : "No match — this segment would not qualify."}
                </div>
                <TraceView outcome={outcome} />
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
