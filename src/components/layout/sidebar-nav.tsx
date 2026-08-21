"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "@/config/nav";
import { PRODUCT_TAGLINE } from "@/config/labels";
import { Droplets } from "lucide-react";

/** `overrides` maps href -> renamed label, from Settings -> Navigation. The
 * sidebar is a client component, so the server layout passes them in. */
export function SidebarNav({ overrides = {} }: { overrides?: Record<string, string> }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
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
                      className={cn(
                        "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
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
    </aside>
  );
}
