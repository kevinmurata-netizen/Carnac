"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CircleDot } from "lucide-react";
import type { OptionChoice } from "@/server/scenario-options";

/**
 * Which treatments and combinations a scenario considers.
 *
 * Off by default, and saying so: "whole library" is the state almost every
 * scenario wants, and a page that opened with two dozen ticked boxes would
 * imply a decision nobody made. Turning the limit on reveals the lists already
 * fully ticked, so narrowing is a matter of unticking rather than starting
 * from nothing.
 *
 * The state lives here as names and ids rather than in hidden inputs kept in
 * sync, because the parent form needs to compare it against what was stored to
 * mark the section changed — the same reason every other field on this form is
 * controlled.
 */
export type OptionPickerValue = {
  limitsOptions: boolean;
  treatments: string[];
  combinations: string[];
};

export function OptionPicker({
  treatments,
  combinations,
  value,
  onChange,
  saved,
  idPrefix = "",
}: {
  treatments: OptionChoice[];
  combinations: OptionChoice[];
  value: OptionPickerValue;
  onChange: (next: OptionPickerValue) => void;
  /** What is stored, when there is something stored to differ from. */
  saved?: OptionPickerValue;
  idPrefix?: string;
}) {
  const allTreatmentKeys = treatments.map((t) => t.key);
  // A disabled combination never enumerates, so "select all" must not tick it
  // — the run would silently not include it and the box would be a lie.
  const allCombinationKeys = combinations.filter((c) => c.enabled).map((c) => c.key);

  const changed =
    saved != null &&
    (saved.limitsOptions !== value.limitsOptions ||
      !sameSet(saved.treatments, value.treatments) ||
      !sameSet(saved.combinations, value.combinations));

  const set = (patch: Partial<OptionPickerValue>) => onChange({ ...value, ...patch });

  const toggle = (list: "treatments" | "combinations", key: string) => {
    const current = value[list];
    set({ [list]: current.includes(key) ? current.filter((k) => k !== key) : [...current, key] });
  };

  const selectedCount = value.treatments.length + value.combinations.length;
  const nothingSelected = value.limitsOptions && selectedCount === 0;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">What this scenario considers</CardTitle>
          {changed && (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
              <CircleDot className="h-3 w-3" />
              Changed
            </span>
          )}
        </div>
        <p className="text-sm font-normal text-muted-foreground">
          By default a scenario may fund anything in the library. Narrow it to answer a specific question — what would
          a relining-only program buy, or what gets picked if the only option is replacement.
        </p>
      </CardHeader>

      <CardContent className="space-y-4 border-t pt-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="limitsOptions"
            id={`${idPrefix}limitsOptions`}
            checked={value.limitsOptions}
            onChange={(e) =>
              set(
                e.target.checked
                  ? // Opening the lists fully ticked: narrowing is unticking,
                    // and an empty list would look like a broken screen.
                    {
                      limitsOptions: true,
                      treatments: value.treatments.length > 0 ? value.treatments : allTreatmentKeys,
                      combinations: value.combinations.length > 0 ? value.combinations : allCombinationKeys,
                    }
                  : { limitsOptions: false }
              )
            }
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-medium">Consider only what I select</span>
            <span className="block text-xs text-muted-foreground">
              {value.limitsOptions
                ? `${selectedCount} of ${treatments.length + combinations.length} selected`
                : "Off — the whole library is on the table"}
            </span>
          </span>
        </label>

        {value.limitsOptions && (
          <>
            {nothingSelected && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
                Nothing is selected, so this scenario can fund nothing at all. Every segment will sit in the backlog and
                the budget will go unspent.
              </p>
            )}

            <OptionList
              title="Treatments"
              idPrefix={idPrefix}
              name="treatmentOption"
              choices={treatments}
              selected={value.treatments}
              onToggle={(key) => toggle("treatments", key)}
              onAll={() => set({ treatments: allTreatmentKeys })}
              onNone={() => set({ treatments: [] })}
            />

            <OptionList
              title="Combinations"
              idPrefix={idPrefix}
              name="combinationOption"
              choices={combinations}
              selected={value.combinations}
              onToggle={(key) => toggle("combinations", key)}
              onAll={() => set({ combinations: allCombinationKeys })}
              onNone={() => set({ combinations: [] })}
              empty="No combinations defined yet."
              note="A combination can be selected on its own — its members do not also have to be, so “this bundle and nothing else” is a question you can ask."
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OptionList({
  title,
  idPrefix,
  name,
  choices,
  selected,
  onToggle,
  onAll,
  onNone,
  empty,
  note,
}: {
  title: string;
  idPrefix: string;
  name: string;
  choices: OptionChoice[];
  selected: string[];
  onToggle: (key: string) => void;
  onAll: () => void;
  onNone: () => void;
  empty?: string;
  note?: string;
}) {
  const selectable = choices.filter((c) => c.enabled).length;
  const allOn = selectable > 0 && choices.every((c) => !c.enabled || selected.includes(c.key));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">
          {title}{" "}
          <span className="tabular-nums">
            ({selected.length}/{choices.length})
          </span>
        </h4>
        {choices.length > 0 && (
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={onAll} disabled={allOn}>
              Select all
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onNone} disabled={selected.length === 0}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {choices.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {choices.map((choice) => (
            <label
              key={choice.key}
              className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-sm ${
                choice.enabled ? "cursor-pointer hover:border-primary/50" : "opacity-60"
              } ${selected.includes(choice.key) ? "border-primary/60 bg-primary/5" : ""}`}
            >
              <input
                type="checkbox"
                id={`${idPrefix}${name}-${choice.key}`}
                name={name}
                value={choice.key}
                checked={selected.includes(choice.key)}
                disabled={!choice.enabled}
                onChange={() => onToggle(choice.key)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{choice.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{choice.detail}</span>
              </span>
              {!choice.enabled && (
                <Badge variant="secondary" className="ml-auto shrink-0">
                  disabled
                </Badge>
              )}
            </label>
          ))}
        </div>
      )}

      {note && choices.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}
