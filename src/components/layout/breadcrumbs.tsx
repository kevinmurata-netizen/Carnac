"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { isRecordId, labelForSegment } from "@/config/breadcrumbs";
import { GENERAL_TAB, TAB_FOR_PATH, tabForPath, tabHref, type SettingsTab } from "@/config/settings-tabs";

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

type Crumb = { key: string; href: string; label: string; isLast: boolean };

export function Breadcrumbs() {
  const pathname = usePathname();
  const search = useSearchParams();
  const { labels, overrides } = useContext(BreadcrumbContext);

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const nameFor = (href: string, segment: string) =>
    overrides[href] ?? (isRecordId(segment) ? (labels[segment] ?? "…") : labelForSegment(segment));

  const settingsCrumb: Crumb = {
    key: "settings",
    href: "/settings",
    label: overrides["/settings"] ?? labelForSegment("settings"),
    isLast: false,
  };

  const tabCrumb = (tab: SettingsTab, isLast: boolean): Crumb => ({
    key: "tab",
    href: tabHref(tab),
    label: tab.label,
    isLast,
  });

  // The Settings landing page names whichever tab is showing, so the trail is
  // never just "Settings" with the tab invisible.
  if (pathname === "/settings") {
    const key = search.get("tab") ?? GENERAL_TAB.key;
    const tab = Object.values(TAB_FOR_PATH).find((t) => t.key === key) ?? GENERAL_TAB;
    return <Trail crumbs={[settingsCrumb, tabCrumb(tab, true)]} />;
  }

  /**
   * Configuration pages read as Settings › Tab › Page rather than following
   * their path, so going back one level returns to the tab the page belongs to.
   * Several sit outside /settings in the URL — Filters, and the Administration
   * sub-pages — which a path-derived trail cannot express.
   */
  const tab = tabForPath(pathname);
  if (tab) {
    // Everything from the page's own route onwards: usually one segment, but a
    // record page like /settings/treatments/[id] contributes its own as well.
    const ownIndex = segments.findIndex((_, i) => TAB_FOR_PATH["/" + segments.slice(0, i + 1).join("/")]);
    const tail = segments.slice(ownIndex === -1 ? segments.length - 1 : ownIndex);

    return (
      <Trail
        crumbs={[
          settingsCrumb,
          tabCrumb(tab, false),
          ...tail.map((segment, i) => {
            const href = "/" + segments.slice(0, segments.length - tail.length + i + 1).join("/");
            return {
              key: `page-${i}`,
              href,
              label: nameFor(href, segment),
              isLast: i === tail.length - 1,
            };
          }),
        ]}
      />
    );
  }

  return (
    <Trail
      crumbs={segments.map((segment, i) => {
        const href = "/" + segments.slice(0, i + 1).join("/");
        return { key: href, href, label: nameFor(href, segment), isLast: i === segments.length - 1 };
      })}
    />
  );
}

function Trail({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((c) => (
          <li key={c.key} className="flex min-w-0 items-center gap-1">
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
