"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, CircleDot } from "lucide-react";

/**
 * A page built from sections that can each be folded away, with one control
 * that opens or closes all of them.
 *
 * Everything starts open. A page that hides its own content on arrival makes
 * the reader work to discover what is there; collapsing is for getting one
 * long section out of the way once you know it exists, which is a decision
 * only the reader can make.
 *
 * A section can also report that it holds unsaved edits, which shows in its
 * header. That matters most exactly when the section is folded shut: without
 * it, closing a section would hide the fact that anything is pending at all.
 */

type SectionState = {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  isDirty: (id: string) => boolean;
  setDirty: (id: string, dirty: boolean) => void;
};

const SectionContext = createContext<SectionState | null>(null);

/** The id of the section a component is rendered inside, so an editor can say
 * "I have unsaved changes" without being told which section it sits in. */
const SectionIdContext = createContext<string | null>(null);

export function SectionGroup({
  children,
  ids,
}: {
  children: ReactNode;
  /** Every section id on the page, so Show all and Hide all know the full set
   * without having to discover it as sections mount. */
  ids: string[];
}) {
  // Closed ids rather than open ones, so a section added later is open by
  // default without anyone having to remember to register it.
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [dirty, setDirtyIds] = useState<Set<string>>(new Set());

  const allClosed = ids.length > 0 && ids.every((id) => closed.has(id));

  // Stable, so the effect in useSectionDirty depends on a function that does
  // not change every render — and returns the same Set when nothing moved, so
  // a section reporting the state it already reported cannot loop.
  const setDirty = useCallback((id: string, isDirty: boolean) => {
    setDirtyIds((prev) => {
      if (prev.has(id) === isDirty) return prev;
      const next = new Set(prev);
      if (isDirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo<SectionState>(
    () => ({
      isOpen: (id) => !closed.has(id),
      toggle: (id) =>
        setClosed((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      isDirty: (id) => dirty.has(id),
      setDirty,
    }),
    [closed, dirty, setDirty]
  );

  return (
    <SectionContext.Provider value={value}>
      <div className="mb-3 flex items-center justify-end gap-3">
        {dirty.size > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
            <CircleDot className="h-3 w-3" />
            {dirty.size} section{dirty.size === 1 ? "" : "s"} with unsaved changes
          </span>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setClosed(allClosed ? new Set() : new Set(ids))}
        >
          {allClosed ? "Show all" : "Hide all"}
        </Button>
      </div>
      <div className="space-y-4">{children}</div>
    </SectionContext.Provider>
  );
}

/**
 * Report from inside a section that it holds edits nobody has saved yet.
 *
 * Called by the editor that owns the state, because only it knows what
 * "changed" means. Does nothing outside a SectionGroup, so an editor used on
 * its own elsewhere is unaffected.
 */
export function useSectionDirty(dirty: boolean) {
  const id = useContext(SectionIdContext);
  const setDirty = useContext(SectionContext)?.setDirty;

  useEffect(() => {
    if (!id || !setDirty) return;
    setDirty(id, dirty);
    // Clearing on unmount, so a section that goes away does not leave the page
    // claiming it still has something pending.
    return () => setDirty(id, false);
  }, [id, setDirty, dirty]);
}

/** The same thing as a component, for a section whose content is a plain form
 * rather than an editor with somewhere to put the hook. */
export function SectionDirty({ dirty }: { dirty: boolean }) {
  useSectionDirty(dirty);
  return null;
}

export function CollapsibleSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ctx = useContext(SectionContext);
  // Usable on its own, in which case it simply stays open.
  const [standalone, setStandalone] = useState(true);
  const open = ctx ? ctx.isOpen(id) : standalone;
  const toggle = () => (ctx ? ctx.toggle(id) : setStandalone((v) => !v));
  const dirty = ctx?.isDirty(id) ?? false;

  return (
    <Card className={dirty ? "border-amber-500/50" : undefined}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-6 py-4 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold leading-none tracking-tight">{title}</span>
            {dirty && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                <CircleDot className="h-3 w-3" />
                Unsaved changes
              </span>
            )}
          </span>
          {description && <span className="mt-1.5 block text-sm text-muted-foreground">{description}</span>}
        </span>
      </button>
      {/* Hidden rather than unmounted: a section holding a half-typed form
          field should not lose it when folded away. */}
      <SectionIdContext.Provider value={id}>
        <CardContent className={`border-t pt-4 ${open ? "" : "hidden"}`}>{children}</CardContent>
      </SectionIdContext.Provider>
    </Card>
  );
}
