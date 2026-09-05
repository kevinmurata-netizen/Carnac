"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RuleSummary } from "@/server/rules";

/**
 * Chooses which rules gate this treatment.
 *
 * A rule is not written here — it belongs to the organization and is written
 * once on the Treatment Rules page. This only decides which of them apply,
 * which is what makes "Condition 0-30" attachable to three treatments instead
 * of copied into three.
 */
export function RulePicker({
  treatmentName,
  allRules,
  attachedIds,
  qualifyMode,
  canEdit,
  onSave,
}: {
  treatmentName: string;
  allRules: RuleSummary[];
  attachedIds: string[];
  qualifyMode: "any" | "all";
  canEdit: boolean;
  onSave: (ruleIds: string[], mode: "any" | "all") => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(attachedIds);
  const [mode, setMode] = useState<"any" | "all">(qualifyMode);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [saved, setSaved] = useState(() => JSON.stringify({ ids: [...attachedIds].sort(), mode }));
  const dirty = JSON.stringify({ ids: [...selected].sort(), mode }) !== saved;

  const toggle = (id: string) =>
    setSelected((all) => (all.includes(id) ? all.filter((x) => x !== id) : [...all, id]));

  const save = async () => {
    setBusy(true);
    setResult(null);
    const outcome = await onSave(selected, mode);
    setResult(outcome);
    if (outcome.ok) {
      setSaved(JSON.stringify({ ids: [...selected].sort(), mode }));
      router.refresh();
    }
    setBusy(false);
  };

  const allows = allRules.filter((r) => r.effect === "allow");
  const blocks = allRules.filter((r) => r.effect === "block");
  const activeAllows = selected.filter((id) => allows.some((r) => r.id === id && r.enabled)).length;

  const row = (r: RuleSummary) => (
    <label
      key={r.id}
      className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted/50"
    >
      <input
        type="checkbox"
        checked={selected.includes(r.id)}
        onChange={() => toggle(r.id)}
        disabled={!canEdit}
        className="mt-0.5 h-4 w-4 accent-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{r.name}</span>
        {!r.enabled && <span className="ml-2 text-xs text-muted-foreground">(disabled)</span>}
        <span className="mt-0.5 block text-xs text-muted-foreground">{r.summary}</span>
        {r.usedBy.filter((n) => n !== treatmentName).length > 0 && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Also used by {r.usedBy.filter((n) => n !== treatmentName).join(", ")} — editing it changes those too.
          </span>
        )}
      </span>
    </label>
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>When this treatment can be used</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {selected.length === 0
              ? "No rules attached, so this treatment is considered for every inspected asset."
              : `${selected.length} rule${selected.length === 1 ? "" : "s"} attached.`}{" "}
            <Link href="/settings/decision-trees" className="text-primary hover:underline">
              Write or edit rules →
            </Link>
          </p>
        </div>
        {canEdit && (
          <Button type="button" size="sm" onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4 border-t pt-4">
        {activeAllows > 1 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">An asset qualifies when</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "any" | "all")}
              disabled={!canEdit}
              aria-label="How the allow rules combine"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">every rule</option>
              <option value="any">any one rule</option>
            </select>
            <span className="text-muted-foreground">below matches. Blocks always apply either way.</span>
          </div>
        )}

        <div>
          <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Allows — an asset must match to qualify
          </p>
          {allows.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">None written yet.</p>
          ) : (
            allows.map(row)
          )}
        </div>

        <div>
          <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Blocks — a match refuses the treatment
          </p>
          {blocks.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">None written yet.</p>
          ) : (
            blocks.map(row)
          )}
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1 border-t pt-3">
            {allRules
              .filter((r) => selected.includes(r.id))
              .map((r) => (
                <Badge key={r.id} variant={r.effect === "block" ? "destructive" : "secondary"}>
                  {r.name}
                </Badge>
              ))}
          </div>
        )}

        {result && <p className={`text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}>{result.message}</p>}
      </CardContent>
    </Card>
  );
}
