"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/config/nav";
import { PRODUCT_TAGLINE } from "@/config/labels";
import { Droplets } from "lucide-react";

/**
 * The navigation itself, with no opinion about how it is displayed. The app
 * shell renders it inside the fixed sidebar on wide screens and inside the
 * slide-over drawer on narrow ones, so both stay in step from one definition.
 *
 * `overrides` maps href -> renamed label, from Settings → Navigation.
 * `onNavigate` lets the drawer close itself when a link is followed.
 */
export function SidebarNav({
  overrides = {},
  onNavigate,
}: {
  overrides?: Record<string, string>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-5">
        <Droplets className="h-6 w-6 text-sidebar-primary" />
        <span className="text-lg font-semibold tracking-tight">CARNAC</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
                      {!item.live && (
                        <span className="rounded border border-sidebar-foreground/20 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/50">
                          Phase {item.phase}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-5 py-3 text-[11px] text-sidebar-foreground/40">
        {PRODUCT_TAGLINE}
      </div>
    </div>
  );
}
