"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, CalendarRange, Check, Search, X } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { TreatmentCategory } from "@/domain/waterline/treatment";

/**
 * One year's alternatives, searchable and sortable in the browser.
 *
 * Client-side for the same reason as the ranked options grid: filtering while
 * you type cannot survive a round trip per keystroke. One year is around a
 * thousand rows on the seed network, which is comfortable; the whole run is
 * not, which is why the page shows a year at a time and the spreadsheet is
 * where the whole run lives.
 */

export type AlternativeRow = {
  year: number;
  assetId: string;
  assetCode: string;
  conditionBefore: number;
  optionLabel: string;
  members: string;
  isCombination: boolean;
  category: TreatmentCategory;
  cost: number;
  benefit: number | null;
  priority: number | null;
  criticality: number;
  scaleFactor: number;
  categoryWeight: number;
  conditionAfter: number | null;
  riskBefore: number | null;
  riskAfter: number | null;
  selected: boolean;
  reason: string;
};

type SortKey =
  | "year"
  | "priority"
  | "assetCode"
  | "optionLabel"
  | "category"
  | "cost"
  | "benefit"
  | "conditionBefore"
  | "reason";

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: "assetCode", label: "Segment" },
  { key: "conditionBefore", label: "WCI", numeric: true },
  { key: "optionLabel", label: "Option" },
  { key: "category", label: "Category" },
  { key: "cost", label: "Cost", numeric: true },
  { key: "benefit", label: "Benefit", numeric: true },
  { key: "priority", label: "Priority", numeric: true },
  { key: "reason", label: "Outcome" },
];

const CATEGORY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Assess: "secondary",
  Repair: "outline",
  Rehabilitate: "default",
  Renew: "destructive",
  Retire: "secondary",
};

/** Enough to read the shape of a year without building a DOM nobody scrolls;
 * the count line always says how many actually matched. One segment across the
 * run is a couple of hundred rows at most, and cutting that off would hide the
 * years someone came to see — so it is shown whole. */
const SHOWN_PER_YEAR = 100;
const SHOWN_PER_SEGMENT = 1000;

export function AlternativesGrid({
  rows,
  showYear = false,
  allYearsBase,
}: {
  rows: AlternativeRow[];
  /** One segment across the run, rather than one year across the network. */
  showYear?: boolean;
  /** Prefix for a row's "every year" link, with the segment id appended. A
   * string rather than a function because a server component cannot hand a
   * client one a callback. Absent in the all-years view, which is there
   * already. */
  allYearsBase?: string;
}) {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [only, setOnly] = useState<"all" | "selected" | "not">("all");
  // Across years the story is chronological; within a year it is the ranking.
  const [sort, setSort] = useState<SortKey>(showYear ? "year" : "priority");
  const [descending, setDescending] = useState(!showYear);

  const columns = showYear ? [{ key: "year" as const, label: "Year", numeric: true }, ...COLUMNS] : COLUMNS;

  const presentCategories = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);
  // Commonest first: the reasons that explain most of a year are the ones
  // worth a chip, and a year can produce half a dozen different ones.
  const presentReasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) if (!r.selected) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const matched = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = rows.filter((r) => {
      if (only === "selected" && !r.selected) return false;
      if (only === "not" && r.selected) return false;
      if (categories.length > 0 && !categories.includes(r.category)) return false;
      if (reasons.length > 0 && !reasons.includes(r.reason)) return false;
      if (terms.length === 0) return true;
      const haystack = `${r.assetCode} ${r.optionLabel} ${r.members} ${r.category} ${r.reason}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });

    const direction = descending ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "number" || typeof bv === "number") {
        // An option ruled out before scoring has no Priority Score. It sorts
        // last whichever way the column points: unknown is not worst.
        const an = typeof av === "number" ? av : null;
        const bn = typeof bv === "number" ? bv : null;
        if (an == null && bn == null) return 0;
        if (an == null) return 1;
        if (bn == null) return -1;
        return (an - bn) * direction;
      }
      return String(av).localeCompare(String(bv)) * direction;
    });
  }, [rows, query, categories, reasons, only, sort, descending]);

  const shown = matched.slice(0, showYear ? SHOWN_PER_SEGMENT : SHOWN_PER_YEAR);
  const filtering = query.trim() !== "" || categories.length > 0 || reasons.length > 0 || only !== "all";

  const toggleSort = (key: SortKey) => {
    if (key === sort) {
      setDescending((d) => !d);
      return;
    }
    setSort(key);
    // Years open oldest-first; other numbers largest-first; text A–Z.
    setDescending(key === "year" ? false : (columns.find((c) => c.key === key)?.numeric ?? false));
  };

  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs transition-colors ${
      on
        ? "border-transparent bg-primary font-medium text-primary-foreground"
        : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search segment, option or outcome"
            aria-label="Search alternatives"
            className="h-9 w-full rounded-md border border-input bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "selected", "not"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOnly(value)}
              aria-pressed={only === value}
              className={chip(only === value)}
            >
              {value === "all" ? "All" : value === "selected" ? "Selected" : "Not selected"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {presentCategories.map((category) => {
          const on = categories.includes(category);
          return (
            <button
              key={category}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setCategories((c) => (on ? c.filter((x) => x !== category) : [...c, category]))
              }
              className={chip(on)}
            >
              {category}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {presentReasons.map(([reason, count]) => {
          const on = reasons.includes(reason);
          return (
            <button
              key={reason}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setReasons((r) => (on ? r.filter((x) => x !== reason) : [...r, reason]));
                // A reason is a reason for *not* selecting, so asking for one
                // while showing only selected rows would return nothing and
                // look broken. Widen the view instead of arguing with it.
                if (!on && only === "selected") setOnly("all");
              }}
              className={chip(on)}
              title={`${formatNumber(count)} this year`}
            >
              {reason} <span className="tabular-nums opacity-70">{formatNumber(count)}</span>
            </button>
          );
        })}
        {filtering && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery("");
              setCategories([]);
              setReasons([]);
              setOnly("all");
            }}
          >
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtering
          ? `${formatNumber(matched.length)} of ${formatNumber(rows.length)} alternatives match`
          : `${formatNumber(rows.length)} alternatives considered ${showYear ? "across the run" : "this year"}`}
        {matched.length > shown.length && ` — showing the first ${shown.length}`}
      </p>

      {matched.length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Nothing matches. Every option the run looked at this year is in this table, so a search that finds nothing
          means the words rather than the model.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                {columns.map((column) => (
                  <TableHead key={column.key} className={column.numeric ? "text-right" : undefined}>
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={`inline-flex items-center gap-1 hover:text-foreground ${
                        sort === column.key ? "font-medium text-foreground" : ""
                      }`}
                      aria-label={`Sort by ${column.label}`}
                    >
                      {column.label}
                      {sort === column.key &&
                        (descending ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row, index) => (
                <TableRow
                  key={`${row.year}:${row.assetId}:${row.optionLabel}`}
                  className={row.selected ? "bg-emerald-500/5" : undefined}
                >
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  {showYear && <TableCell className="text-right font-medium tabular-nums">{row.year}</TableCell>}
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/assets/${row.assetId}?tab=treatments`} className="font-medium text-primary hover:underline">
                      {row.assetCode}
                    </Link>
                    {allYearsBase && (
                      <Link
                        href={`${allYearsBase}${row.assetId}`}
                        title={`Every alternative on ${row.assetCode}, every year`}
                        aria-label={`Every alternative on ${row.assetCode}, every year`}
                        className="ml-1.5 text-muted-foreground hover:text-primary"
                      >
                        <CalendarRange className="inline h-3.5 w-3.5" />
                      </Link>
                    )}
                  </TableCell>
                  <TableCell
                    className="text-right tabular-nums"
                    title={
                      row.conditionAfter != null
                        ? `${row.conditionBefore} → ${row.conditionAfter} if this option were done`
                        : undefined
                    }
                  >
                    {row.conditionBefore}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{row.optionLabel}</span>
                    {row.isCombination && <span className="ml-1.5 text-xs text-muted-foreground">{row.members}</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={CATEGORY_VARIANT[row.category] ?? "default"}>{row.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.benefit ?? "—"}</TableCell>
                  <TableCell
                    className="text-right font-medium tabular-nums"
                    title={
                      row.priority == null
                        ? "Ruled out before scoring, so it has no Priority Score."
                        : `criticality ${row.criticality} × scale ${row.scaleFactor}${
                            row.categoryWeight === 1 ? "" : ` × category ×${row.categoryWeight}`
                          } × benefit ${row.benefit} ÷ ${formatCurrency(row.cost)}`
                    }
                  >
                    {row.priority ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {row.selected ? (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                        <Check className="h-3.5 w-3.5" />
                        Selected
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{row.reason}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
