"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * A page built from sections that can each be folded away, with one control
 * that opens or closes all of them.
 *
 * Everything starts open. A page that hides its own content on arrival makes
 * the reader work to discover what is there; collapsing is for getting one
 * long section out of the way once you know it exists, which is a decision
 * only the reader can make.
 */

type SectionState = {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
};

const SectionContext = createContext<SectionState | null>(null);

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

  const allClosed = ids.length > 0 && ids.every((id) => closed.has(id));

  return (
    <SectionContext.Provider
      value={{
        isOpen: (id) => !closed.has(id),
        toggle: (id) =>
          setClosed((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          }),
      }}
    >
      <div className="mb-3 flex justify-end">
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

  return (
    <Card>
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
          <span className="block font-semibold leading-none tracking-tight">{title}</span>
          {description && <span className="mt-1.5 block text-sm text-muted-foreground">{description}</span>}
        </span>
      </button>
      {/* Hidden rather than unmounted: a section holding a half-typed form
          field should not lose it when folded away. */}
      <CardContent className={`border-t pt-4 ${open ? "" : "hidden"}`}>{children}</CardContent>
    </Card>
  );
}
