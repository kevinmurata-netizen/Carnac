"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";

/**
 * Applies a filter saved on the Filters page to this grid.
 *
 * Saved filters are defined over the asset-centric schema, so applying one
 * narrows the grid to the segments it matches. On Inspections that means the
 * inspections belonging to those segments — the filter selects assets, and the
 * grid shows what it holds for them.
 */
export function SavedFilterSelect({
  filters,
}: {
  filters: Array<{ id: string; name: string; criteriaCount: number }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("savedFilter");
  const activeName = filters.find((f) => f.id === active)?.name;

  const set = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("savedFilter", id);
    else next.delete("savedFilter");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  if (filters.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Saved filter</span>
        <Link
          href="/filters"
          className="flex h-9 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          Create one on the Filters page
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Filter className="h-3 w-3" />
        Saved filter
        {active && (
          <button
            type="button"
            onClick={() => set(null)}
            aria-label={`Clear saved filter ${activeName ?? ""}`}
            className="rounded p-0.5 hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </span>
      <select
        value={active ?? ""}
        onChange={(e) => set(e.target.value || null)}
        aria-label="Apply a saved filter"
        className="h-9 w-52 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">No saved filter</option>
        {filters.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
            {f.criteriaCount === 0 ? " (no criteria)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
