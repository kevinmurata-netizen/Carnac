"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorDialog } from "@/components/ui/editor-dialog";
import type { PackChoice, PackOutcome, SampleStep } from "@/server/starter-packs";

type LoadResult = { ok: true; imported: number } | { ok: false; message: string };
type StepState = { status: "waiting" | "loading" | "done" | "failed"; text?: string };

/**
 * Add asset types from a starter pack: each one created fully modelled —
 * attributes, condition index, curves, treatments with prices, failure
 * costs — and the utility's to change from then on.
 */
export function StarterPackDialog({
  packs,
  onApply,
  onLoadSample,
}: {
  packs: PackChoice[];
  onApply: (input: { packId: string; typeCodes: string[] }) => Promise<
    { ok: true; outcome: PackOutcome } | { ok: false; message: string }
  >;
  onLoadSample: (
    input: { typeCode: string; kind: "assets" | "inspections"; csv: string } | { kind: "risk" }
  ) => Promise<LoadResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [packId, setPackId] = useState(packs[0]?.id ?? "");
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const [chosen, setChosen] = useState<string[]>(() => (pack ? pack.types.filter((t) => !t.exists).map((t) => t.code) : []));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const [steps, setSteps] = useState<StepState[] | null>(null);
  const loading = steps?.some((s) => s.status === "loading") ?? false;

  if (!pack) return null;

  // Sample data needs every type it covers set up, and none of them holding
  // assets yet: it is for trying the app out, never mixed into a live network.
  const sampleTypes = pack.types.filter((t) => pack.samples.some((s) => s.typeCode === t.code));
  const missing = sampleTypes.filter((t) => !t.exists);
  const occupied = sampleTypes.filter((t) => t.assets > 0);
  const sampleRows: Array<SampleStep | { kind: "risk"; name: string }> = [
    ...pack.samples,
    { kind: "risk", name: "Risk recomputed" },
  ];

  const loadSamples = async () => {
    const state: StepState[] = sampleRows.map(() => ({ status: "waiting" }));
    const show = (i: number, s: StepState) => {
      state[i] = s;
      setSteps([...state]);
    };
    for (let i = 0; i < sampleRows.length; i++) {
      const row = sampleRows[i];
      show(i, { status: "loading" });
      let result: LoadResult;
      if (row.kind === "risk") {
        result = await onLoadSample({ kind: "risk" });
      } else {
        const response = await fetch(row.url).catch(() => null);
        result =
          response && response.ok
            ? await onLoadSample({ typeCode: row.typeCode, kind: row.kind, csv: await response.text() })
            : { ok: false, message: `${row.name} could not be fetched. Reload the page and try again.` };
      }
      if (!result.ok) {
        show(i, { status: "failed", text: result.message });
        router.refresh();
        return;
      }
      show(i, {
        status: "done",
        text: row.kind === "risk" ? `${result.imported} assets scored` : `${result.imported} ${row.kind === "assets" ? "added" : "recorded"}`,
      });
    }
    router.refresh();
  };

  const apply = () =>
    start(async () => {
      setResult(null);
      const outcome = await onApply({ packId: pack.id, typeCodes: chosen });
      if (!outcome.ok) {
        setResult({ ok: false, text: outcome.message });
        return;
      }
      const o = outcome.outcome;
      const parts = [
        o.created.length > 0 ? `Added ${o.created.join(", ")}, each fully modelled.` : "",
        o.savings > 0 ? `Set ${o.savings} corridor saving${o.savings === 1 ? "" : "s"} between them.` : "",
        ...o.skipped.map((s) => `${s.name}: ${s.reason}.`),
        o.created.length > 0 && pack.hasSamples
          ? "To try them out before your own data is in, Data Import has sample files for each."
          : "",
      ].filter(Boolean);
      setResult({ ok: o.created.length > 0, text: parts.join(" ") });
      setChosen([]);
      router.refresh();
    });

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Package className="mr-1.5 h-4 w-4" aria-hidden />
        Add from a starter pack
      </Button>

      <EditorDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add from a starter pack"
        description="Each asset type you pick is created ready to model: its attributes and measures, inspection form, condition index, deterioration curves, treatments with typical prices, and failure costs. Every figure is an industry-typical starting point — yours to change under Settings."
      >
        <div className="space-y-4">
          {packs.length > 1 && (
            <select
              aria-label="Starter pack"
              value={pack.id}
              onChange={(e) => {
                const next = packs.find((p) => p.id === e.target.value);
                setPackId(e.target.value);
                setChosen(next ? next.types.filter((t) => !t.exists).map((t) => t.code) : []);
              }}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <div>
            <p className="font-medium">{pack.name}</p>
            <p className="text-sm text-muted-foreground">{pack.description}</p>
          </div>
          <ul className="space-y-1 rounded-md border p-2">
            {pack.types.map((t) => {
              const on = chosen.includes(t.code);
              return (
                <li key={t.code}>
                  <label
                    className={`flex items-start gap-2 rounded px-2 py-1.5 text-sm ${t.exists ? "opacity-60" : "hover:bg-muted/50"}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-primary"
                      checked={on}
                      disabled={t.exists || busy}
                      onChange={() => setChosen(on ? chosen.filter((c) => c !== t.code) : [...chosen, t.code])}
                    />
                    <span>
                      <span className="font-medium">{t.name}</span>
                      {t.exists && <span className="ml-1.5 text-xs text-muted-foreground">already set up</span>}
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            A type this organization already has is left exactly as it is. Corridor savings are set only between types
            added here and the pack&apos;s others, where none is set already.
          </p>

          {pack.samples.length > 0 && (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <p className="text-sm font-medium">Sample data</p>
              <p className="text-xs text-muted-foreground">
                A made-up network for trying the app out — not for a live setup. Each file goes through Data Import
                like anyone&apos;s data: the assets first, then their inspection history, then risk.
              </p>
              {steps && (
                <ul className="space-y-1 text-xs">
                  {sampleRows.map((row, i) => {
                    const s = steps[i];
                    return (
                      <li key={row.name} className="flex items-start gap-2">
                        <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          {s.status === "loading" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : s.status === "done" ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                          ) : (
                            <span className={`h-1.5 w-1.5 rounded-full ${s.status === "failed" ? "bg-destructive" : "bg-muted-foreground/40"}`} />
                          )}
                        </span>
                        <span className={s.status === "failed" ? "text-destructive" : s.status === "waiting" ? "text-muted-foreground" : ""}>
                          {row.kind === "risk" ? row.name : `${row.typeName}: ${row.name}`}
                          {s.text && <span className="text-muted-foreground"> — {s.text}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {missing.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add {missing.map((t) => t.name).join(", ")} above first; the sample network needs every type it covers.
                </p>
              ) : occupied.length > 0 && !steps ? (
                <p className="text-xs text-muted-foreground">
                  {occupied.map((t) => t.name).join(", ")} already {occupied.length === 1 ? "has" : "have"} assets, so
                  the sample data stays out: it only goes into empty types.
                </p>
              ) : (
                !steps && (
                  <Button type="button" size="sm" variant="outline" disabled={loading || busy} onClick={() => void loadSamples()}>
                    Load sample data
                  </Button>
                )
              )}
            </div>
          )}

          {result && (
            <p className={`text-sm ${result.ok ? "text-muted-foreground" : "text-destructive"}`} role="status">
              {result.text}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => setOpen(false)}>
              {result?.ok ? "Done" : "Cancel"}
            </Button>
            <Button type="button" size="sm" disabled={busy || chosen.length === 0} onClick={apply}>
              {busy ? "Setting up…" : `Add ${chosen.length || ""} asset type${chosen.length === 1 ? "" : "s"}`.replace("  ", " ")}
            </Button>
          </div>
        </div>
      </EditorDialog>
    </>
  );
}
