"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EMPTY_SETTINGS_STATE, type SettingsActionState } from "../state";
import { Check, CircleDot, Play, Plus, Trash2 } from "lucide-react";
import type { FormulaField, FormulaPreview, CriticalityModelSummary, ValueMaps } from "@/server/criticality";
import { FUNCTIONS } from "@/domain/waterline/criticality-formula";

type Action = (prev: SettingsActionState, form: FormData) => Promise<SettingsActionState>;

const BLANK = { id: "", name: "", expression: "", valueMaps: {} as ValueMaps };

/**
 * Writing a criticality formula, with the answer visible while you write it.
 *
 * The preview is the point of the screen. A formula that parses can still be
 * wrong in the way that matters — everything scoring 100, or a dropdown value
 * nobody mapped quietly counting as nothing — and the only way to see that is
 * to run it against real assets. So the distribution, the top and bottom
 * scorers, and the count of assets missing an input all sit next to the box
 * you are typing in.
 */
export function FormulaEditor({
  assetTypeId,
  assetTypeName,
  assetCount,
  fields,
  models,
  canEdit,
  save,
  activate,
  remove,
  preview,
}: {
  assetTypeId: string;
  assetTypeName: string;
  assetCount: number;
  fields: FormulaField[];
  models: CriticalityModelSummary[];
  canEdit: boolean;
  save: Action;
  activate: Action;
  remove: Action;
  preview: (
    assetTypeId: string,
    expression: string,
    valueMaps: ValueMaps
  ) => Promise<FormulaPreview>;
}) {
  const [saveState, saveAction] = useActionState(save, EMPTY_SETTINGS_STATE);
  const [activateState, activateAction] = useActionState(activate, EMPTY_SETTINGS_STATE);
  const [deleteState, deleteAction] = useActionState(remove, EMPTY_SETTINGS_STATE);

  const [editing, setEditing] = useState<{ id: string; name: string; expression: string; valueMaps: ValueMaps }>(
    models[0] ?? BLANK
  );
  const [result, setResult] = useState<FormulaPreview | null>(null);
  const [trying, startTry] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  // A different asset type reloads the editor rather than leaving the previous
  // type's formula on screen against the wrong field list.
  const [loadedFor, setLoadedFor] = useState(assetTypeId);
  if (assetTypeId !== loadedFor) {
    setLoadedFor(assetTypeId);
    setEditing(models[0] ?? BLANK);
    setResult(null);
  } else if (editing.id && !models.some((m) => m.id === editing.id)) {
    // The formula being edited was just deleted. Clearing it stops the screen
    // offering to save or activate something that no longer exists.
    setEditing(BLANK);
    setResult(null);
  }

  const insert = (text: string) => {
    const el = box.current;
    if (!el) {
      setEditing((p) => ({ ...p, expression: p.expression ? `${p.expression} ${text}` : text }));
      return;
    }
    const start = el.selectionStart ?? editing.expression.length;
    const end = el.selectionEnd ?? editing.expression.length;
    const next = editing.expression.slice(0, start) + text + editing.expression.slice(end);
    setEditing((p) => ({ ...p, expression: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const runPreview = () =>
    startTry(async () => {
      setResult(await preview(assetTypeId, editing.expression, editing.valueMaps));
    });

  // Only dropdowns the formula actually mentions need numbers, so the mapping
  // editor stays as short as the formula is.
  const mentioned = new Set(
    (editing.expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((s) => s.toUpperCase())
  );
  const choiceFields = fields.filter((f) => f.kind === "choice" && mentioned.has(f.code));

  const setMap = (field: string, value: string, score: string) =>
    setEditing((p) => {
      const maps = { ...p.valueMaps, [field]: { ...(p.valueMaps[field] ?? {}) } };
      const n = Number(score);
      if (score.trim() === "" || !Number.isFinite(n)) delete maps[field][value];
      else maps[field][value] = n;
      return { ...p, valueMaps: maps };
    });

  const feedback = [saveState, activateState, deleteState].find((s) => s.status !== "idle");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Formulas for {assetTypeName}</CardTitle>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(BLANK);
                setResult(null);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New formula
            </Button>
          )}
        </CardHeader>
        <CardContent className="border-t pt-4">
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No formula yet. Until one is active, criticality stays what it has always been here — a rescale of the{" "}
              <Link href="/settings/risk-models" className="text-primary hover:underline">
                risk model&apos;s
              </Link>{" "}
              consequence-of-failure rating.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {models.map((m) => {
                const on = m.id === editing.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setEditing(m);
                      setResult(null);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      on
                        ? "border-transparent bg-primary font-medium text-primary-foreground"
                        : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {m.name}
                    {m.isActive && <span className="ml-1.5 opacity-80">· active</span>}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <form action={saveAction}>
        <input type="hidden" name="id" value={editing.id} />
        <input type="hidden" name="assetTypeId" value={assetTypeId} />
        <input type="hidden" name="valueMaps" value={JSON.stringify(editing.valueMaps)} />

        <Card>
          <CardContent className="grid gap-4 py-5 lg:grid-cols-[260px_1fr]">
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Fields on {assetTypeName}
              </h3>
              <div className="max-h-[420px] overflow-y-auto rounded-md border">
                {fields.map((f) => (
                  <button
                    key={f.code}
                    type="button"
                    onClick={() => insert(f.code)}
                    title={`${f.label} — ${f.help}`}
                    className="flex w-full items-start justify-between gap-2 border-b px-2 py-1.5 text-left last:border-b-0 hover:bg-muted/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[11px]">{f.code}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {f.label}
                        {f.unit ? ` (${f.unit})` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {f.kind === "choice" ? "list" : f.kind === "derived" ? "calc" : "num"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                <p>Click a field to insert it. Also available:</p>
                <ul className="space-y-0.5">
                  {Object.entries(FUNCTIONS).map(([name, fn]) => (
                    <li key={name} className="font-mono text-[10px]">
                      {fn.help}
                    </li>
                  ))}
                </ul>
                <p>
                  + − × ÷ with brackets, comparisons{" "}
                  <span className="font-mono">&gt; &lt; &gt;= &lt;= = !=</span>, and{" "}
                  <span className="font-mono">and</span> / <span className="font-mono">or</span> to join tests.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Formula name</span>
                  <input
                    name="name"
                    value={editing.name}
                    onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                    disabled={!canEdit}
                    maxLength={60}
                    placeholder="Customers and criticality"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Score, clamped to 0–100
                </span>
                <textarea
                  ref={box}
                  name="expression"
                  value={editing.expression}
                  onChange={(e) => setEditing((p) => ({ ...p, expression: e.target.value }))}
                  disabled={!canEdit}
                  spellCheck={false}
                  rows={4}
                  placeholder={"clamp((CUSTOMERS_SERVED / 20) + CRITICALITY * 8 + if(DIAMETER > 12, 15, 0), 0, 100)"}
                  className="w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              </label>

              {choiceFields.length > 0 && (
                <div className="rounded-md border p-3">
                  <h4 className="mb-2 text-xs font-medium">
                    What each value is worth
                    <span className="ml-2 font-normal text-muted-foreground">
                      dropdowns have no number of their own
                    </span>
                  </h4>
                  <div className="space-y-3">
                    {choiceFields.map((f) => (
                      <div key={f.code}>
                        <div className="mb-1 font-mono text-[11px] text-muted-foreground">{f.code}</div>
                        <div className="flex flex-wrap gap-2">
                          {(f.choices ?? []).map((choice) => (
                            <label key={choice} className="flex items-center gap-1 text-xs">
                              <span className="text-muted-foreground">{choice}</span>
                              <input
                                type="number"
                                step="any"
                                disabled={!canEdit}
                                value={editing.valueMaps[f.code]?.[choice] ?? ""}
                                onChange={(e) => setMap(f.code, choice, e.target.value)}
                                aria-label={`${f.code} ${choice}`}
                                className="h-7 w-16 rounded border border-input bg-background px-1.5 text-xs disabled:opacity-60"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={runPreview} disabled={trying || !editing.expression.trim()}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  {trying ? "Trying…" : `Try it on ${assetCount.toLocaleString()} assets`}
                </Button>
                {canEdit && (
                  <Button type="submit" size="sm" disabled={!editing.name.trim() || !editing.expression.trim()}>
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    {editing.id ? "Save changes" : "Create formula"}
                  </Button>
                )}
              </div>

              {feedback && (
                <p className={`text-xs ${feedback.status === "error" ? "text-destructive" : "text-emerald-600"}`}>
                  {feedback.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </form>

      {result && <PreviewPanel result={result} assetCount={assetCount} />}

      {canEdit && editing.id && (
        <div className="flex flex-wrap items-center gap-2">
          <form action={activateAction}>
            <input type="hidden" name="id" value={editing.id} />
            <input
              type="hidden"
              name="deactivate"
              value={String(models.find((m) => m.id === editing.id)?.isActive ?? false)}
            />
            <Button type="submit" size="sm" variant="outline">
              <CircleDot className="mr-1.5 h-3.5 w-3.5" />
              {models.find((m) => m.id === editing.id)?.isActive ? "Stand down" : "Make this the active formula"}
            </Button>
          </form>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={editing.id} />
            <Button type="submit" size="sm" variant="ghost" className="text-destructive hover:text-destructive">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function PreviewPanel({ result, assetCount }: { result: FormulaPreview; assetCount: number }) {
  if (!result.ok) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-4">
          <p className="text-sm text-destructive">{result.error}</p>
          {result.errorAt != null && (
            <p className="mt-1 text-xs text-muted-foreground">At character {result.errorAt + 1}.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const peak = Math.max(1, ...(result.histogram ?? [1]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Tried on {result.assetsScored?.toLocaleString()} assets
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            lowest {result.min} · average {result.average} · highest {result.max}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 border-t pt-4">
        {result.assetsMissingInputs != null && result.assetsMissingInputs > 0 && (
          <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {result.assetsMissingInputs.toLocaleString()} of {assetCount.toLocaleString()} assets are missing a value
            this formula reads — usually a dropdown value with no number set. They score as if it were zero, which
            will drag them down the ranking.
          </p>
        )}

        <div>
          <div className="mb-1 text-xs text-muted-foreground">How the scores spread, in tens</div>
          {/* Bars and labels are separate rows: a percentage height only
              resolves against a parent with a definite height, and a column
              that also holds its own label has neither. */}
          <div className="flex h-24 items-end gap-1">
            {(result.histogram ?? []).map((count, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-primary/70"
                style={{ height: `${Math.max((count / peak) * 100, count > 0 ? 3 : 0)}%` }}
                title={`${count} asset${count === 1 ? "" : "s"} scored ${i * 10}–${i * 10 + 9}`}
              />
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {(result.histogram ?? []).map((count, i) => (
              <div key={i} className="flex-1 text-center">
                <div className="text-[10px] text-foreground">{count}</div>
                <div className="text-[9px] text-muted-foreground">{i * 10}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ScoreList title="Would rank first" rows={result.highest ?? []} />
          <ScoreList title="Would rank last" rows={result.lowest ?? []} />
        </div>

        {result.fieldsUsed && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Reads:</span>
            {result.fieldsUsed.map((f) => (
              <Badge key={f} variant="secondary" className="font-mono text-[10px] font-normal">
                {f}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ assetId: string; assetCode: string; score: number }>;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      <ul className="rounded-md border">
        {rows.map((r) => (
          <li key={r.assetId} className="flex items-center justify-between border-b px-3 py-1.5 text-xs last:border-b-0">
            <Link href={`/assets/${r.assetId}`} className="font-medium text-primary hover:underline">
              {r.assetCode}
            </Link>
            <span className="font-mono">{r.score}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
