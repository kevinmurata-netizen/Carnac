"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { formatCurrency } from "@/lib/format";
import { searchSegmentsAction, previewAdditionAction, addWorkPlanItemAction } from "../actions";
import type { PlannedAddition } from "@/server/workplans";

const control =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Segment = { id: string; assetCode: string; serviceArea: string | null; condition: number | null };

/**
 * Add work the model did not choose.
 *
 * A plan holds what an organization has decided to do, and some of that is
 * already committed for reasons the model knows nothing about — a road scheme
 * the main sits under, a developer contribution. So this prices the work and
 * says whether the treatment's rules allow it here, then lets it be added
 * either way: refused work goes in marked, naming the rule that refused it,
 * rather than being quietly impossible.
 */
export function AddWorkDialog({
  workPlanId,
  treatments,
  years,
  defaultYear,
}: {
  workPlanId: string;
  treatments: Array<{ id: string; name: string; category: string }>;
  years: number[];
  defaultYear: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [segment, setSegment] = useState<Segment | null>(null);
  const [treatmentId, setTreatmentId] = useState(treatments[0]?.id ?? "");
  const [year, setYear] = useState(defaultYear);
  const [preview, setPreview] = useState<PlannedAddition | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startBusy] = useTransition();

  const reset = () => {
    setQuery("");
    setSegments([]);
    setSegment(null);
    setPreview(null);
    setMessage(null);
  };

  const search = () =>
    startBusy(async () => {
      setMessage(null);
      setSegments(await searchSegmentsAction(query));
    });

  const check = (chosen: Segment, treatment: string) =>
    startBusy(async () => {
      setPreview(null);
      setMessage(null);
      const outcome = await previewAdditionAction({ assetId: chosen.id, treatmentId: treatment });
      if (outcome.ok) setPreview(outcome.preview);
      else setMessage({ ok: false, text: outcome.message });
    });

  const add = () =>
    startBusy(async () => {
      if (!segment) return;
      const outcome = await addWorkPlanItemAction({ workPlanId, assetId: segment.id, treatmentId, year });
      setMessage({ ok: outcome.ok, text: outcome.message });
      if (outcome.ok) {
        router.refresh();
        setPreview(null);
        setSegment(null);
        setSegments([]);
        setQuery("");
      }
    });

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" />
        Add work
      </Button>

      <EditorDialog
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Add work to this plan"
        description="For work already committed, or anything the model did not choose. It is priced from the treatment's own rates for that segment."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="segment-search">Segment</Label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="segment-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      search();
                    }
                  }}
                  placeholder="Segment code or district"
                  className={`${control} pl-8`}
                />
              </div>
              <Button type="button" size="sm" variant="outline" onClick={search} disabled={busy}>
                Find
              </Button>
            </div>

            {segments.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
                {segments.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSegment(s);
                        setSegments([]);
                        if (treatmentId) check(s, treatmentId);
                      }}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                    >
                      <span className="font-medium">{s.assetCode}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.serviceArea ?? "—"} · WCI {s.condition ?? "not inspected"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {segment && (
              <p className="text-sm">
                Chosen: <span className="font-medium">{segment.assetCode}</span>
                {segment.serviceArea ? ` · ${segment.serviceArea}` : ""}
                {segment.condition != null ? ` · WCI ${segment.condition}` : ""}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-treatment">Treatment</Label>
              <select
                id="add-treatment"
                value={treatmentId}
                onChange={(e) => {
                  setTreatmentId(e.target.value);
                  if (segment) check(segment, e.target.value);
                }}
                className={control}
              >
                {treatments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.category}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-year">Year</Label>
              <select
                id="add-year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className={control}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {preview && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <p>
                <span className="font-medium">
                  {preview.treatment} on {preview.assetCode}
                </span>{" "}
                — {formatCurrency(preview.cost)}, condition {preview.conditionBefore ?? "unknown"} →{" "}
                {preview.conditionAfter}, risk {preview.riskBefore} → {preview.riskAfter}.
              </p>
              {preview.qualifies ? (
                <p className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  The treatment&apos;s rules allow it on this segment.
                </p>
              ) : (
                <p className="flex items-start gap-2 text-amber-700 dark:text-amber-500">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    The treatment&apos;s rules refuse it here — <span className="font-medium">{preview.refusedBy}</span>.
                    It can still be added, and the row will say so.
                  </span>
                </p>
              )}
            </div>
          )}

          {message && (
            <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-destructive"}`}>{message.text}</p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={busy}
            >
              Close
            </Button>
            <Button type="button" size="sm" onClick={add} disabled={busy || !segment || !preview}>
              {busy ? "Working…" : preview && !preview.qualifies ? "Add anyway" : "Add to plan"}
            </Button>
          </div>
        </div>
      </EditorDialog>
    </>
  );
}
