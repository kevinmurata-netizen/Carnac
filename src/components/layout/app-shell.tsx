"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Menu, X } from "lucide-react";

const STORAGE_KEY = "carnac.sidebar.open";

/**
 * The collapsed/expanded preference is browser state, not React state, so it is
 * read through useSyncExternalStore. That keeps server rendering and hydration
 * consistent — the server has no localStorage and always reports "open" — and
 * avoids setting state from an effect just to catch up with storage.
 */
let cachedOpen: boolean | null = null;
let listeners: Array<() => void> = [];

function subscribeSidebar(onChange: () => void) {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
  };
}

function getSidebarOpen() {
  if (cachedOpen === null) {
    try {
      cachedOpen = window.localStorage.getItem(STORAGE_KEY) !== "false";
    } catch {
      cachedOpen = true;
    }
  }
  return cachedOpen;
}

/** No storage on the server; assume open so the sidebar never renders missing. */
function getSidebarOpenOnServer() {
  return true;
}

function setSidebarOpen(next: boolean) {
  cachedOpen = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // Private browsing can refuse storage. The toggle still works for this
    // session, it just will not be remembered.
  }
  for (const l of listeners) l();
}

/**
 * Frame around every signed-in page: navigation, header, content.
 *
 * One hamburger drives both layouts. Above `md` it collapses and restores the
 * fixed sidebar; below `md` it opens a drawer over the content, because a
 * 256px column would leave nothing for the page itself. Previously the sidebar
 * was simply `hidden md:flex` with no replacement, so a narrow window had no
 * navigation at all.
 */
export function AppShell({
  overrides,
  hidden,
  userName,
  roleName,
  children,
}: {
  overrides: Record<string, string>;
  hidden: string[];
  userName: string;
  roleName: string;
  children: React.ReactNode;
}) {
  const sidebarOpen = useSyncExternalStore(subscribeSidebar, getSidebarOpen, getSidebarOpenOnServer);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen(!getSidebarOpen()), []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind the drawer scrolling under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  // The shell is fixed to the viewport and <main> does the scrolling, so the
  // sidebar and header stay put and a page can pin its own footer to the bottom
  // of the window. Under min-h-screen the page itself scrolled and main's
  // overflow rule never took effect, leaving sticky nothing to hold on to.
  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Wide screens: an in-flow column that can be collapsed away. */}
      {sidebarOpen && (
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-0 h-screen">
            <SidebarNav overrides={overrides} hidden={hidden} />
          </div>
        </aside>
      )}

      {/* Narrow screens: an overlay, so the page keeps its full width. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[85vw] shadow-xl">
            <SidebarNav overrides={overrides} hidden={hidden} onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-2 top-4 rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {/* Two buttons rather than one that branches on matchMedia: the
                control means different things at each width, and a single
                button would announce the sidebar's state while opening the
                drawer. CSS decides which is present, so the breakpoint always
                matches Tailwind's md exactly. */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? "Hide navigation" : "Show navigation"}
              aria-expanded={sidebarOpen}
              className="hidden shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Breadcrumbs />
          </div>
          <UserMenu name={userName} roleName={roleName} />
        </header>
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
