"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSectionDirty } from "@/components/layout/collapsible-section";

import { Plus, Trash2, ArrowUp, ArrowDown, CircleDot } from "lucide-react";
import type { CostRateRow } from "@/server/cost-rates";
import type { RuleSummary } from "@/server/rules";

const control =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Draft = {
  name: string;
  ruleId: string | null;
  unitCost: number;
  costUnit: "per LF" | "per each";
  mobilizationCost: number;
  annualMaintenanceCost: number;
};

/**
 * The prices a treatment can carry, and the rule that picks each one.
 *
 * Order is meaning here, not presentation: rates are tried top to bottom and
 * the first whose rule matches is charged, so a narrow rate has to sit above
 * the broad one it carves out of. That is why the rows move rather than sort,
 * and why the fallback is pinned conceptually to the bottom.
 *
 * Used two ways, like the rule tree: with `onSave` it saves itself, with
 * `onChange` it reports upwards for a treatment that does not exist yet.
 */
export function CostEditor({
  treatmentName,
  initial,
  rules,
  canEdit,
  onSave,
  onChange,
}: {
  treatmentName: string;
  initial: CostRateRow[];
  rules: RuleSummary[];
  canEdit: boolean;
  onSave?: (rates: Draft[]) => Promise<{ ok: boolean; message: string }>;
  onChange?: (rates: Draft[]) => void;
}) {
  const router = useRouter();
  const toDraft = (r: CostRateRow): Draft => ({
    name: r.name,
    ruleId: r.ruleId,
    unitCost: r.unitCost,
    costUnit: r.costUnit,
    mobilizationCost: r.mobilizationCost,
    annualMaintenanceCost: r.annualMaintenanceCost,
  });

  const [rates, setRates] = useState<Draft[]>(initial.map(toDraft));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(() => JSON.stringify(initial.map(toDraft)));
  const dirty = JSON.stringify(rates) !== saved;

  // The surrounding section shows the marker, so a price changed and then
  // folded away still says so.
  useSectionDirty(Boolean(onSave) && dirty);

  useEffect(() => {
    onChange?.(rates);
    // Reporting a value, not reacting to the callback — a parent that passes a
    // fresh arrow function each render must not re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates]);

  const patch = (index: number, change: Partial<Draft>) =>
    setRates((all) => all.map((r, i) => (i === index ? { ...r, ...change } : r)));

  const move = (index: number, by: number) =>
    setRates((all) => {
      const next = [...all];
      const target = index + by;
      if (target < 0 || target >= next.length) return all;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const add = () =>
    setRates((all) => {
      // Inserted above the fallback, because anything below it is unreachable.
      const insertAt = all.length > 0 && !all[all.length - 1].ruleId ? all.length - 1 : all.length;
      const next = [...all];
      next.splice(insertAt, 0, {
        name: "",
        ruleId: rules[0]?.id ?? null,
        unitCost: 0,
        costUnit: "per LF",
        mobilizationCost: 0,
        annualMaintenanceCost: 0,
      });
      return next;
    });

  const save = async () => {
    if (!onSave) return;
    setBusy(true);
    setResult(null);
    const outcome = await onSave(rates);
    setResult(outcome);
    if (outcome.ok) {
      setSaved(JSON.stringify(rates));
      router.refresh();
    }
    setBusy(false);
  };

  const fallbackCount = rates.filter((r) => !r.ruleId).length;

  // The surrounding collapsible section supplies the heading, so this renders
  // its content only — a card inside a card would read as two things.
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rates.length === 1
            ? "One price for every asset."
            : `${rates.length} prices, tried top to bottom — the first whose rule matches is charged.`}{" "}
          <Link href="/settings/decision-trees" className="text-primary hover:underline">
            Write a rule →
          </Link>
        </p>
        {canEdit && (
          <div className="flex items-center gap-2">
            {onSave && dirty && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                <CircleDot className="h-3 w-3" />
                Unsaved changes
              </span>
            )}
            <Button type="button" size="sm" variant="outline" onClick={add}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add a price
            </Button>
            {onSave && (
              <Button type="button" size="sm" onClick={save} disabled={busy || !dirty}>
                {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {rates.map((rate, index) => {
          const isFallback = !rate.ruleId;
          return (
            <div
              key={index}
              className={`rounded-md border p-3 ${isFallback ? "border-dashed bg-muted/30" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-6 text-xs text-muted-foreground">{index + 1}.</span>
                <input
                  value={rate.name}
                  onChange={(e) => patch(index, { name: e.target.value })}
                  disabled={!canEdit}
                  aria-label="Rate name"
                  placeholder="Name this price, e.g. District 3"
                  className={`${control} w-48 font-medium`}
                />
                <span className="text-sm text-muted-foreground">when</span>
                <select
                  value={rate.ruleId ?? ""}
                  onChange={(e) => patch(index, { ruleId: e.target.value || null })}
                  disabled={!canEdit}
                  aria-label="Rule that selects this price"
                  className={`${control} max-w-xs`}
                >
                  <option value="">anything else (the fallback)</option>
                  {rules.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {isFallback && <Badge variant="secondary">fallback</Badge>}

                {canEdit && (
                  <span className="ml-auto flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Move ${rate.name || "rate"} up`}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Move ${rate.name || "rate"} down`}
                      onClick={() => move(index, 1)}
                      disabled={index === rates.length - 1}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${rate.name || "rate"}`}
                      onClick={() => setRates((all) => all.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 pl-8 text-sm">
                <label className="flex items-center gap-1">
                  <span className="text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={rate.unitCost}
                    onChange={(e) => patch(index, { unitCost: Number(e.target.value) })}
                    disabled={!canEdit}
                    aria-label="Unit cost"
                    className={`${control} w-28`}
                  />
                </label>
                <select
                  value={rate.costUnit}
                  onChange={(e) => patch(index, { costUnit: e.target.value as "per LF" | "per each" })}
                  disabled={!canEdit}
                  aria-label="Cost unit"
                  className={control}
                >
                  <option value="per LF">per LF</option>
                  <option value="per each">per each</option>
                </select>
                <label className="flex items-center gap-1">
                  <span className="text-muted-foreground">plus mobilization $</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={rate.mobilizationCost}
                    onChange={(e) => patch(index, { mobilizationCost: Number(e.target.value) })}
                    disabled={!canEdit}
                    aria-label="Mobilization cost"
                    className={`${control} w-28`}
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-muted-foreground">maintenance $</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={rate.annualMaintenanceCost}
                    onChange={(e) => patch(index, { annualMaintenanceCost: Number(e.target.value) })}
                    disabled={!canEdit}
                    aria-label="Annual maintenance cost"
                    className={`${control} w-24`}
                  />
                  <span className="text-muted-foreground">/yr</span>
                </label>
              </div>
            </div>
          );
        })}

        {fallbackCount === 0 && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            No fallback. One price must have no rule, or an asset none of the rules match cannot be priced at all
            and {treatmentName} is simply not offered for it.
          </p>
        )}
        {fallbackCount > 1 && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Two prices have no rule. The first would win and the other would never be used.
          </p>
        )}
        {fallbackCount === 1 && rates[rates.length - 1]?.ruleId && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            The fallback matches everything, so it has to be last. Every price below it is unreachable.
          </p>
        )}

        {result && <p className={`text-sm ${result.ok ? "text-emerald-600" : "text-destructive"}`}>{result.message}</p>}
      </div>
    </div>
  );
}
