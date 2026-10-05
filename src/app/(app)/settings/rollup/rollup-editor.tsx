"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Plus, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DEFAULT_FULL_WEIGHT_SHARE,
  ROLLUP_STRATEGY_LABELS,
  ROLLUP_STRATEGY_TYPES,
  type RollupStrategyType,
} from "@/domain/components/rollup";
import type { RollupChange, RollupPreview, RollupSettings, StrategyRow } from "@/server/rollup";
import {
  applyRollupChangeAction,
  createRollupStrategyAction,
  deleteRollupStrategyAction,
  previewRollupChangeAction,
  type RollupActionResult,
} from "./actions";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const pct = (share: number | null) => (share == null ? "" : `${Math.round(share * 1000) / 10}%`);

/** What is being asked to change, in words, for the preview's title. */
function describe(change: RollupChange, settings: RollupSettings): string {
  const name = (id: string | null) =>
    id == null ? "the organization default" : (settings.strategies.find((s) => s.id === id)?.name ?? "a strategy");
  if (change.kind === "setDefault") return `Make “${name(change.strategyId)}” the organization default`;
  if (change.kind === "setAssetType") {
    const type = settings.assetTypes.find((t) => t.id === change.assetTypeId)?.name ?? "this type";
    return change.strategyId == null ? `${type}: follow the organization default` : `${type}: use “${name(change.strategyId)}”`;
  }
  return `Change “${name(change.strategyId)}” to ${ROLLUP_STRATEGY_LABELS[change.type].toLowerCase()}${
    change.type === "WEIGHTED_WORST_CASE" && change.fullWeightShare != null ? `, governing outright at ${pct(change.fullWeightShare)}` : ""
  }`;
}

export function RollupEditor({ settings, canWrite }: { settings: RollupSettings; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<RollupActionResult | null>(null);

  // The change being previewed, and what it would do.
  const [change, setChange] = useState<RollupChange | null>(null);
  const [preview, setPreview] = useState<RollupPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [editing, setEditing] = useState<StrategyRow | null>(null);
  const [creating, setCreating] = useState(false);

  const askFor = (next: RollupChange) =>
    startTransition(async () => {
      setChange(next);
      setPreview(null);
      setPreviewError(null);
      const result = await previewRollupChangeAction(next);
      if (result.status === "success") setPreview(result.preview);
      else setPreviewError(result.message);
    });

  const apply = () =>
    startTransition(async () => {
      if (!change) return;
      const result = await applyRollupChangeAction(change);
      setMessage(result);
      if (result.status === "success") {
        setChange(null);
        setPreview(null);
        setEditing(null);
      }
    });

  const cancel = () => {
    setChange(null);
    setPreview(null);
    setPreviewError(null);
  };

  const defaultStrategy = settings.strategies.find((s) => s.isDefault) ?? null;

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
            message.status === "error"
              ? "border-destructive/40 bg-destructive/5"
              : "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
          }`}
        >
          {message.status === "error" ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <span>{message.message}</span>
        </div>
      )}

      {/* Strategies ------------------------------------------------------ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Strategies</CardTitle>
          {canWrite && (
            <Button type="button" size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New strategy
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {settings.strategies.map((s) => (
            <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge variant="outline">{s.typeLabel}</Badge>
                  {s.isDefault && (
                    <Badge>
                      <Star className="mr-1 h-3 w-3" />
                      Organization default
                    </Badge>
                  )}
                </div>
                {s.fullWeightShare != null && (
                  <p className="mt-1 text-sm">
                    A component worth <span className="font-medium tabular-nums">{pct(s.fullWeightShare)}</span> or
                    more of the asset governs outright; smaller ones pull in proportion.
                  </p>
                )}
                {s.description && <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>}
                {s.usedBy.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">Scores {s.usedBy.join(", ")}</p>
                )}
              </div>
              {canWrite && (
                <div className="flex shrink-0 items-center gap-1">
                  {!s.isDefault && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => askFor({ kind: "setDefault", strategyId: s.id })}
                    >
                      <Star className="mr-1 h-3.5 w-3.5" />
                      Make default
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                  <ConfirmDelete
                    variant="ghost"
                    ariaLabel={`Delete ${s.name}`}
                    title={`Delete the strategy “${s.name}”?`}
                    description={
                      s.isDefault || s.usedBy.length > 0
                        ? "It is in use, so deletion will be refused. Point what uses it elsewhere first."
                        : "Nothing uses it, so no asset score changes. This cannot be undone."
                    }
                    onConfirm={() =>
                      startTransition(async () => {
                        setMessage(await deleteRollupStrategyAction(s.id));
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </ConfirmDelete>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Asset types ----------------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Asset types</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset type</TableHead>
                  <TableHead>Components</TableHead>
                  <TableHead className="text-right">Assets with components</TableHead>
                  <TableHead>Scored by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.assetTypes.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="max-w-72 text-xs text-muted-foreground">
                      {t.componentTypes.length > 0 ? t.componentTypes.join(" · ") : "None defined — nothing to roll up"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.assetsWithComponents}</TableCell>
                    <TableCell className="min-w-72">
                      {canWrite ? (
                        <select
                          aria-label={`Roll-up strategy for ${t.name}`}
                          value={t.overrideId ?? ""}
                          disabled={pending}
                          onChange={(e) =>
                            askFor({ kind: "setAssetType", assetTypeId: t.id, strategyId: e.target.value || null })
                          }
                          className={input}
                        >
                          <option value="">
                            Organization default{defaultStrategy ? ` — ${defaultStrategy.name}` : ""}
                          </option>
                          {settings.strategies.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm">
                          {t.governing?.name ?? "—"}{" "}
                          <span className="text-xs text-muted-foreground">({t.governing?.source ?? "none"})</span>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Preview --------------------------------------------------------- */}
      <EditorDialog
        open={change != null}
        onClose={cancel}
        title="Preview before applying"
        description={change ? describe(change, settings) : undefined}
      >
        {previewError ? (
          <p className="text-sm text-destructive">{previewError}</p>
        ) : !preview ? (
          <p className="text-sm text-muted-foreground">Working out what it would change…</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              {preview.affected === 0
                ? `No asset score would change — ${preview.considered} assets with components checked.`
                : `${preview.affected} of ${preview.considered} assets with components would score differently. ${
                    preview.rows.length < preview.affected ? `The ${preview.rows.length} that move most:` : "All of them:"
                  }`}
            </p>
            {preview.rows.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead>Now</TableHead>
                      <TableHead>After</TableHead>
                      <TableHead className="text-right">Condition change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r) => {
                      const delta =
                        r.before.condition != null && r.after.condition != null
                          ? Math.round((r.after.condition - r.before.condition) * 10) / 10
                          : null;
                      return (
                        <TableRow key={r.assetId}>
                          <TableCell>
                            <div className="font-medium">{r.assetCode}</div>
                            <div className="text-xs text-muted-foreground">{r.name ?? r.assetTypeName}</div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="tabular-nums">
                              {r.before.condition ?? "—"} <span className="text-muted-foreground">· risk {r.before.risk ?? "—"}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">{r.before.strategy}</div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="tabular-nums">
                              {r.after.condition ?? "—"} <span className="text-muted-foreground">· risk {r.after.risk ?? "—"}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">{r.after.strategy}</div>
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              delta == null || delta === 0 ? "" : delta < 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600"
                            }`}
                          >
                            {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <div data-dialog-actions className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={cancel}>
                Cancel — keep it as it is
              </Button>
              {canWrite && (
                <Button type="button" onClick={apply} disabled={pending}>
                  {pending ? "Applying…" : "Apply this change"}
                </Button>
              )}
            </div>
          </div>
        )}
      </EditorDialog>

      {/* Edit a strategy: its type and, for the worst case, the share at
          which a component governs outright. Saving previews first. */}
      <EditorDialog
        open={editing != null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : ""}
        description="Changing a strategy changes every asset score it governs, so the next step shows those scores before anything is saved."
      >
        {editing && (
          <StrategyForm
            initialType={editing.type}
            initialSharePct={Math.round((editing.fullWeightShare ?? DEFAULT_FULL_WEIGHT_SHARE) * 1000) / 10}
            submitLabel="Preview the change"
            pending={pending}
            onCancel={() => setEditing(null)}
            onSubmit={({ type, sharePct }) => {
              const next: RollupChange = {
                kind: "editStrategy",
                strategyId: editing.id,
                type,
                fullWeightShare: type === "WEIGHTED_WORST_CASE" ? sharePct / 100 : null,
              };
              setEditing(null);
              askFor(next);
            }}
          />
        )}
      </EditorDialog>

      <EditorDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New strategy"
        description="A new strategy scores nothing until it is made the default or an asset type is pointed at it, so it is saved straight away."
      >
        {creating && (
          <StrategyForm
            withName
            initialType="WEIGHTED_WORST_CASE"
            initialSharePct={DEFAULT_FULL_WEIGHT_SHARE * 100}
            submitLabel="Add strategy"
            pending={pending}
            onCancel={() => setCreating(false)}
            onSubmit={({ type, sharePct, name, description }) =>
              startTransition(async () => {
                const result = await createRollupStrategyAction({
                  name: name ?? "",
                  description: description ?? "",
                  type,
                  fullWeightSharePct: type === "WEIGHTED_WORST_CASE" ? sharePct : null,
                });
                setMessage(result);
                if (result.status === "success") setCreating(false);
              })
            }
          />
        )}
      </EditorDialog>
    </div>
  );
}

function StrategyForm({
  withName = false,
  initialType,
  initialSharePct,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
}: {
  withName?: boolean;
  initialType: RollupStrategyType;
  initialSharePct: number;
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (v: { type: RollupStrategyType; sharePct: number; name?: string; description?: string }) => void;
}) {
  const [type, setType] = useState<RollupStrategyType>(initialType);
  const [share, setShare] = useState(String(initialSharePct));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const shareNumber = Number(share);
  const shareValid = share.trim() !== "" && shareNumber > 0 && shareNumber <= 100;
  const missing = [
    withName && !name.trim() ? "A name" : null,
    type === "WEIGHTED_WORST_CASE" && !shareValid ? "a share between 0% and 100%" : null,
  ].filter((v): v is string => v != null);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (missing.length === 0) onSubmit({ type, sharePct: shareNumber, name, description });
      }}
    >
      {withName && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="strategy-name">Name</Label>
            <input id="strategy-name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strategy-description">Description</Label>
            <input
              id="strategy-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={input}
            />
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="strategy-type">Strategy</Label>
        <select
          id="strategy-type"
          value={type}
          onChange={(e) => setType(e.target.value as RollupStrategyType)}
          className={input}
        >
          {ROLLUP_STRATEGY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ROLLUP_STRATEGY_LABELS[t]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {type === "WEIGHTED_WORST_CASE"
            ? "The weighted average, pulled toward the highest-risk component by its share of the asset's replacement cost."
            : type === "REPLACEMENT_COST_WEIGHTED_AVERAGE"
              ? "Every component counted by its share of the asset's replacement cost."
              : "Every component counted equally — a baseline to check the others against."}
        </p>
      </div>
      {type === "WEIGHTED_WORST_CASE" && (
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="strategy-share">Governs outright at (% of the asset)</Label>
          <input
            id="strategy-share"
            type="number"
            min={1}
            max={100}
            step={1}
            value={share}
            onChange={(e) => setShare(e.target.value)}
            className={input}
          />
          <p className="text-xs text-muted-foreground">
            The highest-risk component sets the asset&apos;s score outright once it is worth this much of the asset;
            below that it pulls in proportion. 25% is the default. Lower is harsher.
          </p>
        </div>
      )}
      {missing.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {missing.length === 1 ? `${missing[0]} is required.` : `${missing.join(" and ")} are required.`}
        </p>
      )}
      <div data-dialog-actions className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || missing.length > 0}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
