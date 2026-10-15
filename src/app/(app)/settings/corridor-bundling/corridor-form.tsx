"use client";

import { useActionState, useState } from "react";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/pending-button";
import type { CorridorConfig } from "@/server/corridors";
import type { CorridorFormState } from "./actions";

const box =
  "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** One pair's saving as the form holds it: the percentage as typed. */
type PairState = { sharesMobilization: boolean; pct: string };

/**
 * Corridor bundling settings: how neighbours are found, how far work may move
 * to join them, and what each pair of asset types saves together.
 */
export function CorridorForm({
  config,
  ranges,
  canEdit,
  action,
}: {
  config: CorridorConfig;
  ranges: { distance: { min: number; max: number }; window: { min: number; max: number }; maxSavingPct: number };
  canEdit: boolean;
  action: (prev: CorridorFormState, formData: FormData) => Promise<CorridorFormState>;
}) {
  const [state, formAction] = useActionState(action, { status: "idle" } as CorridorFormState);
  const [distance, setDistance] = useState(String(config.distanceMeters));
  const [windowYears, setWindowYears] = useState(String(config.windowYears));
  const [attributes, setAttributes] = useState<Record<string, string>>(() =>
    Object.fromEntries(config.types.map((t) => [t.id, t.corridorAttribute ?? ""]))
  );

  // Every pair of modelled types, a type with itself included: main beside
  // main is the commonest bundle there is.
  const pairs: Array<{ a: (typeof config.types)[number]; b: (typeof config.types)[number] }> = [];
  config.types.forEach((a, i) => config.types.slice(i).forEach((b) => pairs.push({ a, b })));
  const [savings, setSavings] = useState<Record<string, PairState>>(() => {
    const stored = new Map(config.savings.map((s) => [pairKey(s.assetTypeAId, s.assetTypeBId), s]));
    return Object.fromEntries(
      pairs.map(({ a, b }) => {
        const s = stored.get(pairKey(a.id, b.id));
        return [pairKey(a.id, b.id), { sharesMobilization: s?.sharesMobilization ?? false, pct: s ? String(Math.round(s.savingPct * 1000) / 10) : "0" }];
      })
    );
  });

  const payload = JSON.stringify({
    distanceMeters: Number(distance),
    windowYears: Number(windowYears),
    attributes,
    savings: pairs.map(({ a, b }) => {
      const s = savings[pairKey(a.id, b.id)];
      return { assetTypeAId: a.id, assetTypeBId: b.id, sharesMobilization: s.sharesMobilization, savingPct: (Number(s.pct) || 0) / 100 };
    }),
  });

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="config" value={payload} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="corridor-distance">Neighbour distance (m)</Label>
          <input
            id="corridor-distance"
            type="number"
            min={ranges.distance.min}
            max={ranges.distance.max}
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            disabled={!canEdit}
            className={`${box} w-32`}
          />
          <p className="text-xs text-muted-foreground">
            Two assets this close — between the nearest points of their lines or locations — are neighbours.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="corridor-window">Timing window (years)</Label>
          <input
            id="corridor-window"
            type="number"
            min={ranges.window.min}
            max={ranges.window.max}
            value={windowYears}
            onChange={(e) => setWindowYears(e.target.value)}
            disabled={!canEdit}
            className={`${box} w-24`}
          />
          <p className="text-xs text-muted-foreground">
            How many years ahead work not yet due may be brought forward to join a neighbour&apos;s bundle. 0 bundles
            only work due that year.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Corridor attribute</h3>
        <p className="text-xs text-muted-foreground">
          A word attribute naming where an asset sits — a street, say. Where both assets&apos; types name one and both
          record it, it decides instead of distance: the same value makes them neighbours, a different one does not.
          That is what tells mains along one street from mains that only meet it at a junction.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {config.types.map((t) => (
            <label key={t.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{t.name}</span>
              <select
                aria-label={`${t.name} corridor attribute`}
                value={attributes[t.id]}
                onChange={(e) => setAttributes({ ...attributes, [t.id]: e.target.value })}
                disabled={!canEdit}
                className={`${box} max-w-56`}
              >
                <option value="">Distance alone</option>
                {t.attributeChoices.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">What doing the work together saves</h3>
        <p className="text-xs text-muted-foreground">
          For each pair of asset types. The first member of a bundle pays full price; each one added pays less by its
          pair&apos;s saving. A pair saving nothing never bundles.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Pair</th>
                <th className="px-3 py-2 font-medium">One mobilization</th>
                <th className="px-3 py-2 text-right font-medium">Further saving on each added member (%)</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map(({ a, b }) => {
                const key = pairKey(a.id, b.id);
                const s = savings[key];
                return (
                  <tr key={key} className="border-t">
                    <td className="px-3 py-2">
                      {a.name} + {b.name}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`${a.name} and ${b.name} share one mobilization`}
                        checked={s.sharesMobilization}
                        onChange={(e) => setSavings({ ...savings, [key]: { ...s, sharesMobilization: e.target.checked } })}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={ranges.maxSavingPct * 100}
                        step={1}
                        aria-label={`${a.name} and ${b.name} further saving`}
                        value={s.pct}
                        onChange={(e) => setSavings({ ...savings, [key]: { ...s, pct: e.target.value } })}
                        disabled={!canEdit}
                        className={`${box} w-24 text-right tabular-nums`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {state.status !== "idle" && (
        <p className={`text-sm ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{state.message}</p>
      )}
      {canEdit && <SubmitButton pendingLabel="Saving…">Save</SubmitButton>}
    </form>
  );
}
