"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FilterField } from "@/server/filter-schema";
import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";

/**
 * The chosen columns, in output order.
 *
 * Reordering is drag-and-drop, with up/down buttons alongside. The buttons are
 * not a fallback for old browsers — they are how this is usable by keyboard,
 * and how it works on a touch screen where HTML5 drag events do not fire.
 */
export function SelectedFields({
  selected,
  fieldsByKey,
  onReorder,
  onRemove,
  onDropField,
}: {
  selected: string[];
  fieldsByKey: Map<string, FilterField>;
  onReorder: (from: number, to: number) => void;
  onRemove: (key: string) => void;
  /** A field dragged in from the schema tree. */
  onDropField: (key: string) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dropActive, setDropActive] = useState(false);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= selected.length || from === to) return;
    onReorder(from, to);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (dragIndex === null) setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        const key = e.dataTransfer.getData("text/plain");
        // Only treat it as an incoming field if it did not start in this list.
        if (key && dragIndex === null) onDropField(key);
      }}
      className={`min-h-[120px] rounded-md border-2 border-dashed p-2 transition-colors ${
        dropActive ? "border-primary bg-primary/5" : "border-transparent"
      }`}
    >
      {selected.length === 0 ? (
        <div className="flex h-[110px] items-center justify-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
          Tick a field on the left, or drag one here.
        </div>
      ) : (
        <ol className="space-y-1">
          {selected.map((key, i) => {
            const field = fieldsByKey.get(key);
            const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
            return (
              <li
                key={key}
                draggable
                onDragStart={(e) => {
                  setDragIndex(i);
                  e.dataTransfer.setData("text/plain", key);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) setOverIndex(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragIndex !== null) move(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={`flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm ${
                  dragIndex === i ? "opacity-40" : ""
                } ${isOver ? "border-primary" : ""}`}
              >
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-foreground">{field?.label ?? key}</span>

                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    aria-label={`Move ${field?.label ?? key} up`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={i === selected.length - 1}
                    onClick={() => move(i, i + 1)}
                    aria-label={`Move ${field?.label ?? key} down`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemove(key)}
                    aria-label={`Remove ${field?.label ?? key}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
