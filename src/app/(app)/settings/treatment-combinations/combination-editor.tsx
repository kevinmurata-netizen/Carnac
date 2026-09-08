"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CancelOrDiscard } from "@/components/layout/save-actions";
import { Trash2 } from "lucide-react";
import type { RuleSummary } from "@/server/rules";

const control =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type CombinationDraft = {
  id: string | null;
  name: string;
  description: string;
  enabled: boolean;
  qualifyMode: "any" | "all";
  members: Array<{ treatmentId: string; required: boolean }>;
  ruleIds: string[];
};

/**
 * Defines a bundle: treatments an organization is willing to apply together on
 * one asset in one year.
 *
 * Nothing here removes an option. Every treatment in a combination is still
 * offered on its own, exactly as before — a combination only adds a way of
 * doing several at once, priced as one job.
 */
export function CombinationEditor({
  initial,
  treatments,
  rules,
  resetTreatmentIds,
  onSave,
  onDelete,
}: {
  initial: CombinationDraft;
  treatments: Array<{ id: string; name: string; category: string }>;
  rules: RuleSummary[];
  /** Treatments that reset condition rather than nudging it — two in one
   * bundle is almost always an authoring error. */
  resetTreatmentIds: string[];
  onSave: (draft: CombinationDraft) => Promise<{ ok: boolean; message: string; id?: string }>;
  onDelete: (id: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<CombinationDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // The saved draft itself, so Discard can put it back rather than only
  // noticing that something differs.
  const [saved, setSaved] = useState<CombinationDraft>(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const memberOf = (id: string) => draft.members.find((m) => m.treatmentId === id);

  const toggleMember = (id: string) =>
    setDraft((d) => ({
      ...d,
      members: memberOf(id)
        ? d.members.filter((m) => m.treatmentId !== id)
        : [...d.members, { treatmentId: id, required: true }],
    }));

  const setRequired = (id: string, required: boolean) =>
    setDraft((d) => ({
      ...d,
      members: d.members.map((m) => (m.treatmentId === id ? { ...m, required } : m)),
    }));

  const toggleRule = (id: string) =>
    setDraft((d) => ({
      ...d,
      ruleIds: d.ruleIds.includes(id) ? d.ruleIds.filter((r) => r !== id) : [...d.ruleIds, id],
    }));

  const save = async () => {
    setBusy(true);
    setResult(null);
    const outcome = await onSave(draft);
    setResult(outcome);
    if (outcome.ok) {
      setSaved(draft);
      if (!draft.id && outcome.id) router.replace(`/settings/treatment-combinations?combination=${outcome.id}`);
      else router.refresh();
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!draft.id) return;
    setBusy(true);
    const outcome = await onDelete(draft.id);
    setResult(outcome);
    if (outcome.ok) router.replace("/settings/treatment-combinations");
    setBusy(false);
  };

  const chosenResets = draft.members
    .filter((m) => resetTreatmentIds.includes(m.treatmentId))
    .map((m) => treatments.find((t) => t.id === m.treatmentId)?.name)
    .filter(Boolean) as string[];

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 flex-1 space-y-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            aria-label="Combination name"
            placeholder="Name this combination, e.g. Trenchless package"
            className={`${control} w-full max-w-md font-medium`}
          />
          <input
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            aria-label="Combination description"
            placeholder="Why these go together (optional)"
            className={`${control} w-full max-w-lg`}
          />
        </div>
        <div className="flex items-center gap-2">
          {draft.id && (
            <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={busy} aria-label="Delete combination">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <CancelOrDiscard dirty={dirty} onDiscard={() => setDraft(saved)} disabled={busy} />
          <Button type="button" size="sm" onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={draft.enabled ? "default" : "secondary"}>
            {draft.members.length} treatment{draft.members.length === 1 ? "" : "s"}
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
              Disabled — kept, but never offered as an option.
            </span>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Treatments in this bundle
          </p>
          <p className="mb-2 text-sm text-muted-foreground">
            Each still has to qualify under its own rules. A <span className="font-medium">required</span> member that
            does not qualify rules the whole bundle out; an optional one simply stays behind.
          </p>
          {treatments.map((t) => {
            const member = memberOf(t.id);
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm hover:bg-muted/50">
                <label className="flex flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!member}
                    onChange={() => toggleMember(t.id)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.category}</span>
                </label>
                {member && (
                  <select
                    value={member.required ? "required" : "optional"}
                    onChange={(e) => setRequired(t.id, e.target.value === "required")}
                    aria-label={`Is ${t.name} required`}
                    className={control}
                  >
                    <option value="required">required</option>
                    <option value="optional">optional</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>

        {chosenResets.length > 1 && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {chosenResets.join(" and ")} each reset condition rather than improving it, so bundling them means paying
            for both and counting only the higher. That is usually a mistake — check this is what you meant.
          </p>
        )}

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Extra rules on the bundle (optional)
          </p>
          <p className="mb-2 text-sm text-muted-foreground">
            Usually none. A combination should not re-state conditions its members already carry — add one only for
            something true of the bundle and not of its parts.
          </p>
          {rules.length === 0 ? (
            <p className="px-3 text-sm text-muted-foreground">No rules written yet.</p>
          ) : (
            rules.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-1.5 text-sm hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={draft.ruleIds.includes(r.id)}
                  onChange={() => toggleRule(r.id)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="font-medium">{r.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{r.summary}</span>
                </span>
              </label>
            ))
          )}
        </div>

        {result && <p className={`text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}>{result.message}</p>}
      </CardContent>
    </Card>
  );
}
