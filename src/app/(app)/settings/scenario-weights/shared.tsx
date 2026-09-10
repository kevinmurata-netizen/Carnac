"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * The bits both weight lists on this page need.
 *
 * Benefit Weight and Category Weight are two different arithmetics — shares
 * versus multipliers — but they are the same interaction: a list of named sets,
 * one of them the default, an editor that opens underneath. Sharing the chrome
 * keeps the two halves of one card looking like one card.
 */

export const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type State = { status: "idle" | "success" | "error"; message?: string };
export const EMPTY: State = { status: "idle" };
export type Action = (prev: State, form: FormData) => Promise<State>;

/** The first of the three action states that has anything to say. Saving,
 * making default and deleting each have their own, but only one of them just
 * happened. */
export function firstSpoken(...states: State[]): State {
  return states.find((s) => s.status !== "idle") ?? EMPTY;
}

export function Feedback({ state }: { state: State }) {
  if (state.status === "idle" || !state.message) return null;
  const error = state.status === "error";
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        error
          ? "border-destructive/40 bg-destructive/5"
          : "border-emerald-600/40 bg-emerald-50/50 dark:bg-emerald-950/20"
      }`}
    >
      {error ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      )}
      <span>{state.message}</span>
    </div>
  );
}
