"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  toValues,
  type ScenarioFieldDefaults,
  type ScenarioValues,
} from "./scenario-fields";
import type { OptionPickerValue } from "./option-picker";

/**
 * One scenario's edit state, shared between the form and the page header.
 *
 * The form and the button that submits it are at opposite ends of a long page,
 * and the button has to know whether anything changed. Lifting the state is
 * the only honest way to do that: the alternative — the form telling a parent
 * about its own state through an effect — has the parent re-render on every
 * keystroke for a value it is only mirroring.
 *
 * Everything the header needs is derived here rather than passed up, so there
 * is one definition of "changed" and it cannot drift between the badge at the
 * top and the marks on the fields.
 */

/** The submit button lives outside the form element, so it associates by id.
 * Nothing else in the page may reuse this. */
export const SCENARIO_EDIT_FORM_ID = "scenario-edit";

type ScenarioEditContext = {
  values: ScenarioValues;
  patch: (change: Partial<ScenarioValues>) => void;
  /** What is stored, for the per-field change marks. */
  saved: ScenarioValues;

  options: OptionPickerValue;
  setOptions: (next: OptionPickerValue) => void;
  savedOptions: OptionPickerValue;

  changedCount: number;
  dirty: boolean;
  reset: () => void;

  /**
   * Whether a save is in flight.
   *
   * Tracked here rather than read from `useFormStatus`, which only reports for
   * a form the caller sits inside — and the header button deliberately does
   * not. Set when the header submits; cleared by the remount that follows a
   * successful run.
   */
  submitting: boolean;
  markSubmitting: () => void;
};

const Ctx = createContext<ScenarioEditContext | null>(null);

export function ScenarioEditProvider({
  defaults,
  savedOptions,
  children,
}: {
  defaults: ScenarioFieldDefaults;
  savedOptions: OptionPickerValue;
  children: ReactNode;
}) {
  // Both start from the same place. The caller keys this provider on the
  // scenario's updatedAt, so a save remounts it and `saved` becomes the freshly
  // stored values rather than stale ones.
  const [saved] = useState<ScenarioValues>(() => toValues(defaults));
  const [values, setValues] = useState<ScenarioValues>(saved);
  const [options, setOptions] = useState<OptionPickerValue>(savedOptions);
  const [submitting, setSubmitting] = useState(false);

  const value = useMemo<ScenarioEditContext>(() => {
    const fieldChanges = (Object.keys(values) as Array<keyof ScenarioValues>).filter(
      (k) => values[k] !== saved[k]
    ).length;

    // The picker counts as one change however many boxes moved: "8 unsaved
    // changes" because someone unticked eight treatments would drown out the
    // budget edit sitting next to it.
    const optionsChanged =
      savedOptions.limitsOptions !== options.limitsOptions ||
      !sameSet(savedOptions.treatments, options.treatments) ||
      !sameSet(savedOptions.combinations, options.combinations);

    const changedCount = fieldChanges + (optionsChanged ? 1 : 0);

    return {
      values,
      patch: (change) => setValues((v) => ({ ...v, ...change })),
      saved,
      options,
      setOptions,
      savedOptions,
      changedCount,
      dirty: changedCount > 0,
      reset: () => {
        setValues(saved);
        setOptions(savedOptions);
      },
      submitting,
      markSubmitting: () => setSubmitting(true),
    };
  }, [values, saved, options, savedOptions, submitting]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Null when the page is read-only: a role that cannot run scenarios gets no
 * provider, and the header renders nothing rather than a button it may not
 * press. Callers check for null rather than being handed a disabled control.
 */
export function useScenarioEdit(): ScenarioEditContext | null {
  return useContext(Ctx);
}

/** Order-insensitive; the picker appends rather than sorting. */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}
