"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/config/nav";
import { groupKey } from "@/config/nav-groups";
import { PRODUCT_TAGLINE } from "@/config/labels";
import { Droplets } from "lucide-react";

/**
 * The navigation itself, with no opinion about how it is displayed. The app
 * shell renders it inside the fixed sidebar on wide screens and inside the
 * slide-over drawer on narrow ones, so both stay in step from one definition.
 *
 * `overrides` maps href -> renamed label, from Settings → Navigation.
 * `hidden` lists hrefs to leave out of the sidebar. Hiding is presentational:
 * the page still works and its URL still resolves, so the current page stays
 * visible even when hidden — otherwise it would vanish from under you and
 * leave no way back.
 * `onNavigate` lets the drawer close itself when a link is followed.
 */
export function SidebarNav({
  overrides = {},
  hidden = [],
  onNavigate,
}: {
  overrides?: Record<string, string>;
  hidden?: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const hiddenSet = new Set(hidden);
  const isOnPage = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-5">
        <Droplets className="h-6 w-6 text-sidebar-primary" />
        <span className="text-lg font-semibold tracking-tight">CARNAC</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !hiddenSet.has(i.href) || isOnPage(i.href));
          // A group whose every page is hidden has nothing left to head.
          if (items.length === 0 || (hiddenSet.has(groupKey(group.label)) && !items.some((i) => isOnPage(i.href)))) {
            return null;
          }
          return (
          <div key={group.label} className="mb-5">
            <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
              {overrides[groupKey(group.label)] ?? group.label}
            </div>
            <ul className="ml-3 space-y-0.5 border-l border-sidebar-border/60 pl-2">
              {items.map((item) => {
                const active = isOnPage(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <span>{overrides[item.href] ?? item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-5 py-3 text-[11px] text-sidebar-foreground/40">
        {PRODUCT_TAGLINE}
      </div>
    </div>
  );
}
