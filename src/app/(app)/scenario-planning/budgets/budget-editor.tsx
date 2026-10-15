"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PendingLinkButton, SubmitButton } from "@/components/ui/pending-button";
import { formatCurrency } from "@/lib/format";
import { BUDGET_CATEGORIES, type BudgetCategory, type BudgetPlanLine } from "@/domain/waterline/budget-plan";
import type { BudgetFormState } from "./actions";

const input =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const cell =
  "h-8 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** A money cell in the table, which takes its column's width. */
const money = `${cell} w-full min-w-28`;

/** One year as the table holds it: strings, so an emptied box stays empty. */
type Row = { year: string; total: string } & Record<BudgetCategory, string>;

const emptyCategories = () => Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c, ""])) as Record<BudgetCategory, string>;

function toRows(lines: BudgetPlanLine[]): Row[] {
  const years = [...new Set(lines.map((l) => l.year))].sort((a, b) => a - b);
  return years.map((year) => {
    const row: Row = { year: String(year), total: "", ...emptyCategories() };
    for (const l of lines.filter((x) => x.year === year && x.assetTypeId == null)) {
      if (l.category == null) row.total = String(l.amount);
      else if ((BUDGET_CATEGORIES as readonly string[]).includes(l.category)) row[l.category as BudgetCategory] = String(l.amount);
    }
    return row;
  });
}

function toLines(rows: Row[]): Array<{ year: number; category: string | null; amount: number }> {
  const lines: Array<{ year: number; category: string | null; amount: number }> = [];
  for (const r of rows) {
    const year = Number(r.year);
    if (r.total.trim() !== "") lines.push({ year, category: null, amount: Number(r.total) });
    for (const c of BUDGET_CATEGORIES) if (r[c].trim() !== "") lines.push({ year, category: c, amount: Number(r[c]) });
  }
  return lines;
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));
const sumCategories = (r: Row) =>
  BUDGET_CATEGORIES.reduce((sum, c) => sum + (num(r[c]) ?? 0), 0);
const hasCategories = (r: Row) => BUDGET_CATEGORIES.some((c) => r[c].trim() !== "");
/** What the year's money comes to: its total, or its categories added up. */
const yearMoney = (r: Row) => num(r.total) ?? (hasCategories(r) ? sumCategories(r) : null);

/**
 * The budget table: a row per year, a total and, when the money is broken out
 * that way, an amount per category.
 */
export function BudgetEditor({
  action,
  initial,
}: {
  action: (prev: BudgetFormState, formData: FormData) => Promise<BudgetFormState>;
  initial: { id: string; name: string; description: string; lines: BudgetPlanLine[] };
}) {
  const [state, formAction] = useActionState(action, { status: "idle" } as BudgetFormState);
  const thisYear = new Date().getFullYear();
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = toRows(initial.lines);
    return existing.length > 0 ? existing : [{ year: String(thisYear), total: "", ...emptyCategories() }];
  });
  const [byCategory, setByCategory] = useState(() => initial.lines.some((l) => l.category != null));

  // Filling a run of years from one figure and a growth rate: the usual
  // starting point, edited year by year from there.
  const [fill, setFill] = useState({ from: String(thisYear), years: "5", amount: "", growth: "0" });

  const setCell = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addYear = () =>
    setRows((rs) => {
      const last = rs.length > 0 ? Number(rs[rs.length - 1].year) || thisYear - 1 : thisYear - 1;
      return [...rs, { year: String(last + 1), total: "", ...emptyCategories() }];
    });
  const removeYear = (i: number) => setRows((rs) => rs.filter((_, k) => k !== i));
  const fillYears = () => {
    const from = Number(fill.from);
    const count = Math.max(1, Math.min(50, Number(fill.years) || 1));
    const amount = Number(fill.amount);
    const growth = Number(fill.growth) / 100;
    if (!Number.isInteger(from) || !(amount >= 0)) return;
    const filled: Row[] = Array.from({ length: count }, (_, i) => ({
      year: String(from + i),
      total: String(Math.round(amount * Math.pow(1 + growth, i))),
      ...emptyCategories(),
    }));
    // Years outside the fill are kept; years inside it are replaced.
    setRows((rs) =>
      [...rs.filter((r) => !filled.some((f) => f.year === r.year)), ...filled].sort((a, b) => Number(a.year) - Number(b.year))
    );
  };

  const lines = useMemo(() => toLines(rows), [rows]);
  const grand = rows.reduce((sum, r) => sum + (yearMoney(r) ?? 0), 0);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="id" value={initial.id} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="budget-name">Name</Label>
          <input id="budget-name" name="name" defaultValue={initial.name} required className={input} placeholder="e.g. Capital plan 2027–2031" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget-description">Description</Label>
          <input id="budget-description" name="description" defaultValue={initial.description} className={input} />
        </div>
      </div>

      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Fill years</legend>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">From</span>
            <input type="number" value={fill.from} onChange={(e) => setFill({ ...fill, from: e.target.value })} className={`${cell} w-24`} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Years</span>
            <input type="number" min={1} max={50} value={fill.years} onChange={(e) => setFill({ ...fill, years: e.target.value })} className={`${cell} w-20`} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">First year ($)</span>
            <input type="number" min={0} step={100000} value={fill.amount} onChange={(e) => setFill({ ...fill, amount: e.target.value })} className={`${cell} w-36`} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Growth (%/yr)</span>
            <input type="number" step={0.5} value={fill.growth} onChange={(e) => setFill({ ...fill, growth: e.target.value })} className={`${cell} w-24`} />
          </label>
          <Button type="button" size="sm" variant="outline" onClick={fillYears} disabled={fill.amount.trim() === ""}>
            Fill
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sets each year&apos;s total from one figure and a growth rate, replacing those years. Change any year by hand
          afterwards.
        </p>
      </fieldset>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={byCategory} onChange={(e) => setByCategory(e.target.checked)} />
          Break the money out by category
        </label>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Year</th>
                <th className="px-3 py-2 text-right font-medium">Total ($)</th>
                {byCategory && BUDGET_CATEGORIES.map((c) => (
                  <th key={c} className="px-3 py-2 text-right font-medium">{c} ($)</th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const over = num(r.total) != null && hasCategories(r) && sumCategories(r) > num(r.total)!;
                return (
                  <tr key={i} className="border-t align-top">
                    <td className="px-3 py-1.5">
                      <input type="number" aria-label="Year" value={r.year} onChange={(e) => setCell(i, { year: e.target.value })} className={`${cell} w-24 text-left`} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        aria-label={`${r.year} total`}
                        value={r.total}
                        placeholder={hasCategories(r) ? String(sumCategories(r)) : ""}
                        onChange={(e) => setCell(i, { total: e.target.value })}
                        className={money}
                      />
                      {over && <p className="mt-1 text-right text-xs text-amber-600">Categories add up to more; the total still holds.</p>}
                    </td>
                    {byCategory &&
                      BUDGET_CATEGORIES.map((c) => (
                        <td key={c} className="px-3 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step={10000}
                            aria-label={`${r.year} ${c}`}
                            value={r[c]}
                            onChange={(e) => setCell(i, { [c]: e.target.value } as Partial<Row>)}
                            className={money}
                          />
                        </td>
                      ))}
                    <td className="px-3 py-1.5 text-right">
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeYear(i)} disabled={rows.length === 1}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t bg-muted/30 text-sm">
              <tr>
                <td className="px-3 py-2 font-medium">All years</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(grand)}</td>
                {byCategory && BUDGET_CATEGORIES.map((c) => (
                  <td key={c} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatCurrency(rows.reduce((sum, r) => sum + (num(r[c]) ?? 0), 0))}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addYear}>
          Add a year
        </Button>
        <p className="text-xs text-muted-foreground">
          A scenario following this budget spends each year&apos;s total in place of its annual budget and growth.
          {byCategory &&
            " A category amount is the most that kind of work may take that year; a category left blank is held only by the total. Leave the total blank and it is the categories added up."}{" "}
          Years not listed here use the scenario&apos;s own annual budget and growth. Assess and Retire work is never
          funded by a scenario, so they have no column.
        </p>
      </div>

      {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}

      <div className="flex items-center gap-2">
        <SubmitButton pendingLabel="Saving…">{initial.id ? "Save budget" : "Create budget"}</SubmitButton>
        <PendingLinkButton href="/scenario-planning/budgets" pendingLabel="Leaving…" variant="ghost">
          Cancel
        </PendingLinkButton>
      </div>
    </form>
  );
}
