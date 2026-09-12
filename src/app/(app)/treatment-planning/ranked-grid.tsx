"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { TreatmentCategory } from "@/domain/waterline/treatment";

/**
 * The ranked options, searchable and sortable in the browser.
 *
 * Filtering happens on the client because the request was to filter *while
 * typing*, and a round trip per keystroke is not that. The whole fundable set
 * is therefore serialised into the page — about 1,000 rows on the seed
 * network, in a shape trimmed to what the grid draws.
 *
 * That is the honest limit of this approach and it is worth writing down: the
 * cost is linear in the network. A utility with fifty thousand segments would
 * produce a payload nobody should download to type in a search box, and this
 * would have to move behind the server with a debounce. It is fine at this
 * size and it will not be fine at every size.
 */

/** Trimmed server-side: `members` arrives joined, and fields the grid never
 * draws are left behind. The full shape is roughly four times this. */
export type RankedRow = {
  assetId: string;
  assetCode: string;
  conditionScore: number | null;
  riskScore: number | null;
  optionLabel: string;
  members: string;
  isCombination: boolean;
  category: TreatmentCategory;
  totalCost: number;
  expectedBenefit: number;
  priority: number | null;
  criticality: number;
  scaleFactor: number;
  categoryWeight: number;
  isRecommended: boolean;
  conditionGain: number;
  riskPointsRemoved: number;
  lifeCycleSaving: number;
};

type SortKey = "priority" | "assetCode" | "optionLabel" | "category" | "totalCost" | "expectedBenefit";

const COLUMNS: Array<{ key: SortKey; label: string; numeric?: boolean }> = [
  { key: "assetCode", label: "Segment" },
  { key: "optionLabel", label: "Option" },
  { key: "category", label: "Category" },
  { key: "totalCost", label: "Total Cost", numeric: true },
  { key: "expectedBenefit", label: "Benefit", numeric: true },
  { key: "priority", label: "Priority", numeric: true },
];

const CATEGORY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Assess: "secondary",
  Repair: "outline",
  Rehabilitate: "default",
  Renew: "destructive",
  Retire: "secondary",
};

/** Enough to judge the shape of the answer without building a DOM nobody
 * scrolls. The count line always says how many actually matched. */
const SHOWN = 50;

export function RankedGrid({ rows }: { rows: RankedRow[] }) {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [combinationsOnly, setCombinationsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("priority");
  const [descending, setDescending] = useState(true);

  const present = useMemo(
    () => [...new Set(rows.map((r) => r.category))].sort(),
    [rows]
  );

  const matched = useMemo(() => {
    // Matched against the text someone can actually see in the row, plus the
    // member names — a bundle is most naturally searched for by what is in it
    // ("cathodic"), and its own label may not mention either part.
    const needle = query.trim().toLowerCase();
    const terms = needle.split(/\s+/).filter(Boolean);

    const filtered = rows.filter((r) => {
      if (combinationsOnly && !r.isCombination) return false;
      if (categories.length > 0 && !categories.includes(r.category)) return false;
      if (terms.length === 0) return true;
      const haystack = `${r.assetCode} ${r.optionLabel} ${r.members} ${r.category}`.toLowerCase();
      // Every term must appear, so "WL-0197 repair" narrows rather than widens.
      return terms.every((t) => haystack.includes(t));
    });

    const direction = descending ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "number" || typeof bv === "number") {
        // Unpriced options have no score and sort last whichever way the
        // column is pointing — "worst" is not the same as "unknown".
        const an = typeof av === "number" ? av : null;
        const bn = typeof bv === "number" ? bv : null;
        if (an == null && bn == null) return 0;
        if (an == null) return 1;
        if (bn == null) return -1;
        return (an - bn) * direction;
      }
      return String(av).localeCompare(String(bv)) * direction;
    });
  }, [rows, query, categories, combinationsOnly, sort, descending]);

  const shown = matched.slice(0, SHOWN);
  const filtering = query.trim() !== "" || categories.length > 0 || combinationsOnly;

  const toggleSort = (key: SortKey) => {
    if (key === sort) {
      setDescending((d) => !d);
      return;
    }
    setSort(key);
    // Numbers open largest-first and text A–Z, which is what each one means by
    // "most useful first".
    setDescending(COLUMNS.find((c) => c.key === key)?.numeric ?? false);
  };

  const toggleCategory = (category: TreatmentCategory) =>
    setCategories((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category]
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search segment, option or treatment"
            aria-label="Search ranked options"
            className="h-9 w-full rounded-md border border-input bg-background pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {present.map((category) => {
            const on = categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  on
                    ? "border-transparent bg-primary font-medium text-primary-foreground"
                    : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {category}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setCombinationsOnly((v) => !v)}
            aria-pressed={combinationsOnly}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              combinationsOnly
                ? "border-transparent bg-primary font-medium text-primary-foreground"
                : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            Combinations only
          </button>

          {filtering && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setCategories([]);
                setCombinationsOnly(false);
              }}
            >
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtering
          ? `${formatNumber(matched.length)} of ${formatNumber(rows.length)} fundable options match`
          : `${formatNumber(rows.length)} fundable options`}
        {matched.length > shown.length && ` — showing the first ${shown.length}`}
      </p>

      {matched.length === 0 ? (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Nothing matches. Every option here is one the effectiveness floor already allows, so a search that finds
          nothing means the words rather than the ranking.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                {COLUMNS.map((column) => (
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
                <TableRow key={`${row.assetId}:${row.optionLabel}`}>
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>
                    <Link
                      href={`/assets/${row.assetId}?tab=treatments`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.assetCode}
                    </Link>
                    {row.conditionScore != null && (
                      <span className="ml-1.5 text-xs text-muted-foreground">WCI {row.conditionScore}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{row.optionLabel}</span>
                    {row.isCombination && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{row.members}</span>
                    )}
                    {row.isRecommended && (
                      <span
                        className="ml-1.5 text-xs text-muted-foreground"
                        title="Also what this segment's own recommendation picks, on its separate risk-reduction-per-dollar basis with the professional overrides applied."
                      >
                        · recommended
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={CATEGORY_VARIANT[row.category] ?? "default"}>{row.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.totalCost)}</TableCell>
                  <TableCell
                    className="text-right tabular-nums"
                    title={`Condition +${row.conditionGain} WCI · Risk −${row.riskPointsRemoved} pts (criticality excluded) · Life-cycle saving ${formatCurrency(row.lifeCycleSaving)}`}
                  >
                    {row.expectedBenefit}
                  </TableCell>
                  <TableCell
                    className="text-right font-medium tabular-nums"
                    title={
                      row.priority == null
                        ? "No priority score — this option could not be priced, so there is nothing to divide by."
                        : `criticality ${row.criticality} × scale ${row.scaleFactor}${
                            row.categoryWeight === 1 ? "" : ` × category ×${row.categoryWeight}`
                          } × benefit ${row.expectedBenefit} ÷ ${formatCurrency(row.totalCost)}`
                    }
                  >
                    {row.priority ?? "—"}
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
