"use client";

import { useSyncExternalStore } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ACCENTS,
  ACCENT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  type AccentKey,
  type ThemeMode,
} from "@/components/layout/theme-script";
import { Check, Monitor, Moon, RotateCcw, Sun } from "lucide-react";

/**
 * Theme is browser state, not React state, so it is read through
 * useSyncExternalStore. That keeps the server render and hydration consistent —
 * the server has no localStorage and reports the defaults — and avoids setting
 * state from an effect just to catch up with storage.
 */
let cache: { mode: ThemeMode; accent: AccentKey | null } | null = null;
let listeners: Array<() => void> = [];

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((l) => l !== onChange);
  };
}

function read() {
  if (!cache) {
    try {
      const mode = (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) ?? "system";
      const accent = localStorage.getItem(ACCENT_STORAGE_KEY) as AccentKey | null;
      cache = { mode: ["light", "dark", "system"].includes(mode) ? mode : "system", accent };
    } catch {
      cache = { mode: "system", accent: null };
    }
  }
  return cache;
}

const SERVER_SNAPSHOT: { mode: ThemeMode; accent: AccentKey | null } = { mode: "system", accent: null };
function readOnServer() {
  return SERVER_SNAPSHOT;
}

function apply(next: { mode: ThemeMode; accent: AccentKey | null }) {
  cache = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next.mode);
    if (next.accent) localStorage.setItem(ACCENT_STORAGE_KEY, next.accent);
    else localStorage.removeItem(ACCENT_STORAGE_KEY);
  } catch {
    // Private browsing can refuse storage; the change still applies for this
    // session, it just will not be remembered.
  }

  const dark =
    next.mode === "dark" ||
    (next.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);

  const root = document.documentElement.style;
  const accent = ACCENTS.find((a) => a.key === next.accent);
  if (accent) {
    const value = dark ? accent.dark : accent.light;
    root.setProperty("--primary", value);
    root.setProperty("--sidebar-primary", value);
    root.setProperty("--ring", value);
  } else {
    root.removeProperty("--primary");
    root.removeProperty("--sidebar-primary");
    root.removeProperty("--ring");
  }

  for (const l of listeners) l();
}

const MODES: Array<{ key: ThemeMode; label: string; icon: React.ReactNode; hint: string }> = [
  { key: "light", label: "Light", icon: <Sun className="h-4 w-4" />, hint: "Always light" },
  { key: "dark", label: "Dark", icon: <Moon className="h-4 w-4" />, hint: "Always dark" },
  { key: "system", label: "System", icon: <Monitor className="h-4 w-4" />, hint: "Follow the operating system" },
];

export function ThemeEditor() {
  const state = useSyncExternalStore(subscribe, read, readOnServer);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Applies immediately, and is remembered on this device.</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => {
              const on = state.mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => apply({ ...state, mode: m.key })}
                  aria-pressed={on}
                  className={`flex min-w-[130px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                    on ? "border-primary bg-primary/5" : "hover:border-primary/40"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {m.icon}
                    {m.label}
                    {on && <Check className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.hint}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Accent Colour</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Used for primary buttons, links, focus rings and the active sidebar item.
            </p>
          </div>
          {state.accent && (
            <Button type="button" size="sm" variant="ghost" onClick={() => apply({ ...state, accent: null })}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Default
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => {
              const on = state.accent === a.key;
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => apply({ ...state, accent: a.key })}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    on ? "border-primary bg-primary/5 font-medium" : "hover:border-primary/40"
                  }`}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-black/10"
                    style={{ backgroundColor: state.mode === "dark" ? a.dark : a.light }}
                  />
                  {a.label}
                  {on && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            This is a per-browser preference, not an organization-wide one — each person picks their own. Making it a
            shared default would mean storing it against the organization, which is a schema change rather than a
            setting.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
