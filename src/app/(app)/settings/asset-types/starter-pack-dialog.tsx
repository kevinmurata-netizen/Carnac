"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorDialog } from "@/components/ui/editor-dialog";
import type { PackChoice, PackOutcome } from "@/server/starter-packs";

/**
 * Add asset types from a starter pack: each one created fully modelled —
 * attributes, condition index, curves, treatments with prices, failure
 * costs — and the utility's to change from then on.
 */
export function StarterPackDialog({
  packs,
  onApply,
}: {
  packs: PackChoice[];
  onApply: (input: { packId: string; typeCodes: string[] }) => Promise<
    { ok: true; outcome: PackOutcome } | { ok: false; message: string }
  >;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [packId, setPackId] = useState(packs[0]?.id ?? "");
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const [chosen, setChosen] = useState<string[]>(() => (pack ? pack.types.filter((t) => !t.exists).map((t) => t.code) : []));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  if (!pack) return null;

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

          {result && (
            <p className={`text-sm ${result.ok ? "text-muted-foreground" : "text-destructive"}`} role="status">
              {result.text}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
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
