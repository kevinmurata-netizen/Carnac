"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useParentHref } from "./breadcrumbs";

/**
 * The button that sits beside Save on every page that has one.
 *
 * With nothing changed it is Cancel, and leaves for the page named to the left
 * in the breadcrumb. Once something is changed it becomes Discard changes,
 * because leaving is no longer the harmless act it was a moment ago — the same
 * click would silently throw the edit away. Saving turns it back into Cancel.
 *
 * One control rather than two: a Cancel and a Discard side by side would ask
 * the reader to work out which one loses their work.
 */
export function CancelOrDiscard({
  dirty,
  onDiscard,
  backHref,
  size = "sm",
  disabled,
}: {
  dirty: boolean;
  /** Put the editor back to its saved state. Not called when `dirty` is false. */
  onDiscard: () => void;
  /** Overrides the breadcrumb parent, for a page whose "back" is not simply
   * one level up. */
  backHref?: string;
  size?: "sm" | "default";
  disabled?: boolean;
}) {
  const parent = useParentHref();
  const href = backHref ?? parent;

  if (dirty) {
    return (
      <Button type="button" size={size} variant="outline" onClick={onDiscard} disabled={disabled}>
        Discard changes
      </Button>
    );
  }

  // No parent to go back to — the page is the top of its own trail, and a
  // Cancel that went nowhere would be worse than none at all.
  if (!href) return null;

  return (
    <Button size={size} variant="outline" nativeButton={false} render={<Link href={href}>Cancel</Link>} />
  );
}

/**
 * Whether a plain form holds unsaved edits, for the forms that keep their
 * values in the DOM rather than in React state.
 *
 * Compared against a snapshot of what the form held when it was last saved, so
 * typing something and typing it back reads as clean — the same rule the
 * editors that track their own state already follow. Attach `anchorRef` to any
 * element inside the form; the form itself is found from it.
 */
export function useFormDirty(resetKey: unknown, formId?: string) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const baseline = useRef("");
  const [dirty, setDirty] = useState(false);

  // The saved state moved, so nothing is outstanding any more. Done during
  // render rather than in the effect below: React discards this pass and
  // re-renders immediately, and the effect is left doing only what an effect
  // should — subscribing, and reading the DOM it subscribes to.
  const [seen, setSeen] = useState(resetKey);
  if (seen !== resetKey) {
    setSeen(resetKey);
    if (dirty) setDirty(false);
  }

  // A save bar usually sits inside the form it saves. Where it does not — a
  // form referenced by id from outside — the id says which one to watch.
  const findForm = useCallback(
    () =>
      formId
        ? (document.getElementById(formId) as HTMLFormElement | null)
        : (anchorRef.current?.closest("form") ?? null),
    [formId]
  );

  useEffect(() => {
    const form = findForm();
    if (!form) return;

    // File values have no useful string form and no form here uploads, so they
    // are left out rather than serialised as "[object File]".
    const snapshot = () =>
      JSON.stringify([...new FormData(form).entries()].filter(([, v]) => typeof v === "string"));

    baseline.current = snapshot();

    // Listened for on the document, not on the form. A field can belong to a
    // form by `form=` attribute while sitting somewhere else in the page —
    // FormData still collects it, but its events bubble through where it
    // actually sits and would never reach the form at all.
    const check = () => setDirty(snapshot() !== baseline.current);
    document.addEventListener("input", check);
    document.addEventListener("change", check);
    return () => {
      document.removeEventListener("input", check);
      document.removeEventListener("change", check);
    };
    // Re-baselined whenever the caller says the saved state moved — normally
    // the action's result, so a successful save makes the current values the
    // new "unchanged".
  }, [resetKey, findForm]);

  const discard = useCallback(() => {
    findForm()?.reset();
    setDirty(false);
  }, [findForm]);

  return { anchorRef, dirty, discard };
}
