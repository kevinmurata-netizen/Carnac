"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { TableHead } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter } from "lucide-react";
import { useState } from "react";

/**
 * A grid column header with sorting and an optional per-column filter.
 *
 * Both live in the URL rather than component state, so a sorted, filtered grid
 * is a link you can share or bookmark, and the server does the work — the page
 * never has to ship every row to the browser to sort it.
 */
export function ColumnHeader({
  label,
  sortKey,
  filterParam,
  options,
  className,
}: {
  label: string;
  /** Omit to render a plain, unsortable header. */
  sortKey?: string;
  /** Query parameter this column filters on. Omit for no filter. */
  filterParam?: string;
  /** Values offered in the filter dropdown. */
  options?: string[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const currentSort = params.get("sort");
  const currentDir = params.get("dir") === "desc" ? "desc" : "asc";
  const isSorted = sortKey != null && currentSort === sortKey;
  const activeFilter = filterParam ? params.get(filterParam) : null;

  const go = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const toggleSort = () =>
    go((next) => {
      if (!sortKey) return;
      // Third click clears the sort rather than cycling forever between the
      // two directions with no way back to the natural order.
      if (isSorted && currentDir === "desc") {
        next.delete("sort");
        next.delete("dir");
      } else {
        next.set("sort", sortKey);
        next.set("dir", isSorted && currentDir === "asc" ? "desc" : "asc");
      }
    });

  return (
    <TableHead className={className}>
      <span className="flex items-center gap-1 whitespace-nowrap">
        {sortKey ? (
          <button
            type="button"
            onClick={toggleSort}
            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
            title={
              !isSorted
                ? `Sort by ${label}`
                : currentDir === "asc"
                  ? `Sort ${label} descending`
                  : `Clear sort on ${label}`
            }
          >
            {label}
            {isSorted ? (
              currentDir === "asc" ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )
            ) : (
              <ChevronsUpDown className="h-3 w-3 opacity-40" />
            )}
          </button>
        ) : (
          label
        )}

        {filterParam && options && options.length > 0 && (
          <span className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={`Filter by ${label}`}
              aria-expanded={open}
              className={`rounded p-0.5 hover:bg-muted hover:text-foreground ${
                activeFilter ? "text-primary" : "opacity-40"
              }`}
            >
              <Filter className="h-3 w-3" />
            </button>

            {open && (
              <>
                {/* Click-away layer, so the menu closes without a global listener. */}
                <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <span className="absolute left-0 top-6 z-50 block max-h-64 w-52 overflow-auto rounded-md border bg-card p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      go((next) => next.delete(filterParam));
                      setOpen(false);
                    }}
                    className={`block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted ${
                      !activeFilter ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    All
                  </button>
                  {options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => {
                        go((next) => next.set(filterParam, o));
                        setOpen(false);
                      }}
                      className={`block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted ${
                        activeFilter === o ? "font-medium text-foreground" : "text-muted-foreground"
                      }`}
                      title={o}
                    >
                      {o}
                    </button>
                  ))}
                </span>
              </>
            )}
          </span>
        )}
      </span>
    </TableHead>
  );
}
