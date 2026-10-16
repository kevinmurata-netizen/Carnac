"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { formatCurrency } from "@/lib/format";
import { previewCorridorBundleAction, applyCorridorBundleAction } from "../actions";
import type { CorridorBundlePreview } from "@/server/workplans";

/**
 * Bundle neighbouring work with a project by hand: projects in the same year
 * on neighbouring assets, each priced at what doing it beside this one saves
 * for its pair of asset types (Settings › Corridor Bundling).
 */
export function CorridorDialog({
  workPlanId,
  itemId,
  assetCode,
}: {
  workPlanId: string;
  itemId: string;
  assetCode: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CorridorBundlePreview | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startBusy] = useTransition();

  const load = () =>
    startBusy(async () => {
      setMessage(null);
      setPreview(null);
      setChosen([]);
      const outcome = await previewCorridorBundleAction({ workPlanId, itemId });
      if (outcome.ok) setPreview(outcome.preview);
      else setMessage({ ok: false, text: outcome.message });
    });

  const bundle = () =>
    startBusy(async () => {
      const outcome = await applyCorridorBundleAction({ workPlanId, itemId, joinItemIds: chosen });
      setMessage({ ok: outcome.ok, text: outcome.message });
      if (outcome.ok) {
        router.refresh();
        setOpen(false);
      }
    });

  const saving = (preview?.offers ?? []).filter((o) => chosen.includes(o.itemId)).reduce((s, o) => s + o.saving, 0);

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        title={`Bundle work on neighbouring assets in the same year with ${assetCode}, for what doing it together saves`}
        onClick={() => {
          setOpen(true);
          load();
        }}
      >
        Bundle
      </Button>

      <EditorDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Bundle neighbouring work with ${assetCode}`}
        description={`${assetCode} keeps its price. Each project you pick joins it in one corridor and costs less by what that pair of asset types saves done together.`}
      >
        <div className="space-y-4">
          {busy && !preview && !message && <p className="py-6 text-sm text-muted-foreground">Looking for neighbouring work…</p>}

          {preview?.note && (
            <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">{preview.note}</p>
          )}

          {preview && preview.offers.length > 0 && (
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
              {preview.offers.map((o) => {
                const on = chosen.includes(o.itemId);
                return (
                  <li key={o.itemId}>
                    <label className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={on}
                          onChange={() => setChosen(on ? chosen.filter((x) => x !== o.itemId) : [...chosen, o.itemId])}
                        />
                        <span>
                          <span className="font-medium">{o.assetCode}</span>{" "}
                          <span className="text-muted-foreground">{o.treatment}</span>
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-right tabular-nums text-xs">
                        {formatCurrency(o.cost)} → {formatCurrency(o.cost - o.saving)}
                        <span className="ml-1 text-muted-foreground">(−{formatCurrency(o.saving)})</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {message && (
            <p className={`text-sm ${message.ok ? "text-muted-foreground" : "text-destructive"}`}>{message.text}</p>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {chosen.length > 0 ? `Saves ${formatCurrency(saving)} in ${preview?.year}` : ""}
            </span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={busy || chosen.length === 0} onClick={bundle}>
                {busy && chosen.length > 0 ? "Bundling…" : "Bundle"}
              </Button>
            </div>
          </div>
        </div>
      </EditorDialog>
    </>
  );
}
