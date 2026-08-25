"use client";

import { useState } from "react";
import type { FilterTable } from "@/server/filter-schema";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

/**
 * The schema, as collapsible tables of selectable fields.
 *
 * Fields are also draggable, so they can be dropped straight into the selected
 * list — but the checkbox does the same job. Drag is the shortcut, not the only
 * way in, because drag-only interfaces are unusable by keyboard.
 */
export function SchemaTree({
  schema,
  selected,
  onToggle,
}: {
  schema: FilterTable[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const [openTables, setOpenTables] = useState<Set<string>>(() => new Set([schema[0]?.key]));
  const [query, setQuery] = useState("");

  const term = query.trim().toLowerCase();
  const visible = schema
    .map((t) => ({
      ...t,
      fields: term
        ? t.fields.filter((f) => f.label.toLowerCase().includes(term) || f.key.toLowerCase().includes(term))
        : t.fields,
    }))
    .filter((t) => t.fields.length > 0);

  const isOpen = (key: string) => (term ? true : openTables.has(key));

  const toggleTable = (key: string) =>
    setOpenTables((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fields…"
          aria-label="Search fields"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {visible.length === 0 && (
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">No field matches “{query}”.</p>
      )}

      {visible.map((table) => {
        const open = isOpen(table.key);
        const chosen = table.fields.filter((f) => selected.includes(f.key)).length;
        return (
          <div key={table.key} className="rounded-md border">
            <button
              type="button"
              onClick={() => toggleTable(table.key)}
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1 text-sm font-medium text-foreground">{table.label}</span>
              <span className="text-xs text-muted-foreground">
                {chosen > 0 ? `${chosen}/${table.fields.length}` : table.fields.length}
              </span>
            </button>

            {open && (
              <div className="border-t px-3 py-2">
                <p className="mb-2 text-xs text-muted-foreground">{table.description}</p>
                <ul className="space-y-0.5">
                  {table.fields.map((field) => {
                    const on = selected.includes(field.key);
                    return (
                      <li key={field.key}>
                        <label
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", field.key);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          className="flex cursor-grab items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/60 active:cursor-grabbing"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => onToggle(field.key)}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          <span className={on ? "font-medium text-foreground" : "text-muted-foreground"}>
                            {field.label}
                          </span>
                          <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/60">
                            {field.type}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
