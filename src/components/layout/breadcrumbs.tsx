"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { isRecordId, labelForSegment } from "@/config/breadcrumbs";

/** Labels supplied by pages for dynamic segments, keyed by the segment itself
 * so a stale label from a previous page can never be shown against a new id. */
type LabelMap = Record<string, string>;

const BreadcrumbContext = createContext<{
  labels: LabelMap;
  overrides: Record<string, string>;
  register: (segment: string, label: string) => void;
}>({ labels: {}, overrides: {}, register: () => {} });

export function BreadcrumbProvider({
  children,
  overrides = {},
}: {
  children: React.ReactNode;
  overrides?: Record<string, string>;
}) {
  const [labels, setLabels] = useState<LabelMap>({});

  const value = useMemo(
    () => ({
      labels,
      overrides,
      register: (segment: string, label: string) =>
        setLabels((prev) => (prev[segment] === label ? prev : { ...prev, [segment]: label })),
    }),
    [labels, overrides]
  );

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/**
 * Rendered by a page that owns a dynamic segment, to name it in the trail —
 * e.g. an asset page supplies "WL-0228" in place of the raw cuid.
 */
export function SetBreadcrumb({ segment, label }: { segment: string; label: string }) {
  const { register } = useContext(BreadcrumbContext);
  useEffect(() => register(segment, label), [segment, label, register]);
  return null;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const { labels, overrides } = useContext(BreadcrumbContext);

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, i) => ({
    segment,
    href: "/" + segments.slice(0, i + 1).join("/"),
    // A record id shows the page-supplied label; until it arrives, show
    // nothing rather than a raw cuid.
    // A renamed page wins over the code default, so the trail agrees with the
    // sidebar and the page heading.
    label: isRecordId(segment)
      ? (labels[segment] ?? "…")
      : (overrides["/" + segments.slice(0, i + 1).join("/")] ?? labelForSegment(segment)),
    isLast: i === segments.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((c) => (
          <li key={c.href} className="flex min-w-0 items-center gap-1">
            {c.isLast ? (
              <span className="truncate font-medium text-foreground" aria-current="page">
                {c.label}
              </span>
            ) : (
              <>
                <Link href={c.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                  {c.label}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
