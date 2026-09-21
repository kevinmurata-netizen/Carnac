"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { formatCurrency } from "@/lib/format";
import { segmentRowsAction, previewCombineAction, combineItemsAction } from "../actions";
import type { CombinePreview } from "@/server/workplans";

const control =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Row = {
  id: string;
  year: number;
  cost: number;
  treatment: string;
  treatmentId: string;
  bundleId: string | null;
  bundleName: string | null;
};

/**
 * Put scheduled work on one segment into a single visit.
 *
 * The saving is the reason to do it: one crew, one traffic plan, one shutdown,
 * so mobilization is charged once rather than once per job. That is exactly how
 * the model prices a combination, and the same arithmetic is used here —
 * including the library's own name and mobilization figure when a combination
 * with these members already exists.
 */
export function CombineDialog({
  workPlanId,
  assetId,
  assetCode,
  itemId,
  treatment,
  year,
  years,
}: {
  workPlanId: string;
  assetId: string;
  assetCode: string;
  itemId: string;
  treatment: string;
  year: number;
  years: number[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [targetYear, setTargetYear] = useState(year);
  const [preview, setPreview] = useState<CombinePreview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startBusy] = useTransition();

  const load = () =>
    startBusy(async () => {
      setMessage(null);
      setPreview(null);
      setChosen([]);
      setRows(await segmentRowsAction(workPlanId, assetId));
    });

  const check = (ids: string[], into: number) =>
    startBusy(async () => {
      setPreview(null);
      setMessage(null);
      if (ids.length === 0) return;
      const outcome = await previewCombineAction({ workPlanId, itemIds: [itemId, ...ids], year: into });
      if (outcome.ok) setPreview(outcome.preview);
      else setMessage({ ok: false, text: outcome.message });
    });

  const combine = () =>
    startBusy(async () => {
      const outcome = await combineItemsAction({ workPlanId, itemIds: [itemId, ...chosen], year: targetYear });
      setMessage({ ok: outcome.ok, text: outcome.message });
      if (outcome.ok) {
        router.refresh();
        setOpen(false);
      }
    });

  // Everything else on this segment that is not already part of a visit.
  const others = (rows ?? []).filter((r) => r.id !== itemId && !r.bundleId);

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        title={`Combine other work on ${assetCode} with this into one project, so mobilization is charged once`}
        onClick={() => {
          setOpen(true);
          load();
        }}
      >
        Combine
      </Button>

      <EditorDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Combine work on ${assetCode}`}
        description={`Everything you pick becomes one project with ${treatment}. Mobilization is charged once, so the project costs less than the same treatments done apart.`}
      >
        <div className="space-y-4">
          {busy && !rows && <p className="py-6 text-sm text-muted-foreground">Looking for other work on this segment…</p>}

          {rows && others.length === 0 && (
            <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              Nothing else is scheduled on {assetCode} that could join this project. Work already part of another
              project has to be split out first.
            </p>
          )}

          {others.length > 0 && (
            <div className="space-y-1.5">
              <Label>Also do in this project</Label>
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {others.map((r) => {
                  const on = chosen.includes(r.id);
                  return (
                    <li key={r.id}>
                      <label className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={on}
                            onChange={() => {
                              const next = on ? chosen.filter((x) => x !== r.id) : [...chosen, r.id];
                              setChosen(next);
                              check(next, targetYear);
                            }}
                          />
                          <span className="font-medium">{r.treatment}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {r.year} · {formatCurrency(r.cost)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {others.length > 0 && (
            <div className="space-y-1.5 sm:max-w-40">
              <Label htmlFor="combine-year">Do it all in</Label>
              <select
                id="combine-year"
                value={targetYear}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setTargetYear(next);
                  check(chosen, next);
                }}
                className={control}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          {preview && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">
                {preview.name} on {preview.assetCode}
                {preview.matchedCombination && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    — a combination your library already defines
                  </span>
                )}
              </p>
              <p>
                {formatCurrency(preview.combinedCost)} as one project, against {formatCurrency(preview.separateCost)}{" "}
                apart
                {preview.saving > 0 ? (
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {" "}
                    — {formatCurrency(preview.saving)} saved
                  </span>
                ) : (
                  <span className="text-muted-foreground"> — no saving, the rates mobilize the same either way</span>
                )}
                . Condition {preview.conditionBefore ?? "unknown"} → {preview.conditionAfter}, risk{" "}
                {preview.riskBefore} → {preview.riskAfter}.
              </p>
              <ul className="text-xs text-muted-foreground">
                {preview.members.map((m) => (
                  <li key={m.treatment}>
                    {m.treatment}: {formatCurrency(m.separateCost)} in {m.year} → {formatCurrency(m.share)} as part of
                    the project
                  </li>
                ))}
              </ul>
              {preview.refused.length > 0 && (
                <p className="flex items-start gap-2 text-amber-700 dark:text-amber-500">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {preview.refused.join(", ")} {preview.refused.length === 1 ? "is" : "are"} refused on this segment
                    by {preview.refused.length === 1 ? "its" : "their"} own rules. The project can still be made, and the
                    rows will say so.
                  </span>
                </p>
              )}
            </div>
          )}

          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-destructive"}`}>{message.text}</p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Close
            </Button>
            <Button type="button" size="sm" onClick={combine} disabled={busy || !preview}>
              {busy ? "Working…" : preview ? `Combine into ${targetYear}` : "Pick work to combine"}
            </Button>
          </div>
        </div>
      </EditorDialog>
    </>
  );
}
