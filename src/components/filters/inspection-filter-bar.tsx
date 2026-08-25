"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ASSET_LABEL } from "@/config/labels";
import { X } from "lucide-react";

const control =
  "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type InspectionFilterValues = {
  search?: string;
  inspectionType?: string;
  inspector?: string;
  requiresFollowUp?: string;
  after?: string;
  before?: string;
  minQuality?: string;
};

type OptionalFilter = { key: string; label: string; params: Array<keyof InspectionFilterValues> };

/** Filters added from the dropdown. Segment ID and Type are always shown
 * because they are what people reach for first. */
const OPTIONAL_FILTERS: OptionalFilter[] = [
  { key: "inspector", label: "Inspector", params: ["inspector"] },
  { key: "date", label: "Inspected between", params: ["after", "before"] },
  { key: "quality", label: "Minimum quality", params: ["minQuality"] },
  { key: "followUp", label: "Follow-up required", params: ["requiresFollowUp"] },
];

export function InspectionFilterBar({
  inspectionTypes,
  inspectors,
  values,
  action,
}: {
  inspectionTypes: readonly string[];
  inspectors: string[];
  values: InspectionFilterValues;
  action: string;
}) {
  // A filter that already has a value in the URL stays open after submitting,
  // so the bar reflects the query you are actually looking at.
  const [shown, setShown] = useState<string[]>(() =>
    OPTIONAL_FILTERS.filter((f) => f.params.some((p) => values[p])).map((f) => f.key)
  );

  const available = OPTIONAL_FILTERS.filter((f) => !shown.includes(f.key));
  const hasAny = Object.values(values).some(Boolean);
  const remove = (key: string) => setShown((s) => s.filter((k) => k !== key));

  return (
    <form method="get" action={action} className="mb-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={`${ASSET_LABEL.singular} ID`} htmlFor="search">
          <input
            id="search"
            name="search"
            defaultValue={values.search}
            placeholder="WL-0001"
            className={`${control} w-40`}
          />
        </Field>

        <Field label="Type" htmlFor="inspectionType">
          <select
            id="inspectionType"
            name="inspectionType"
            defaultValue={values.inspectionType ?? ""}
            className={`${control} w-44`}
          >
            <option value="">All types</option>
            {inspectionTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        {shown.includes("inspector") && (
          <Removable label="Inspector" onRemove={() => remove("inspector")}>
            <select
              id="inspector"
              name="inspector"
              defaultValue={values.inspector ?? ""}
              className={`${control} w-44`}
            >
              <option value="">Anyone</option>
              {inspectors.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </Removable>
        )}

        {shown.includes("date") && (
          <Removable label="Inspected" onRemove={() => remove("date")}>
            <div className="flex items-center gap-1">
              <input
                name="after"
                type="date"
                defaultValue={values.after ?? ""}
                aria-label="Inspected on or after"
                className={`${control} w-36`}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                name="before"
                type="date"
                defaultValue={values.before ?? ""}
                aria-label="Inspected on or before"
                className={`${control} w-36`}
              />
            </div>
          </Removable>
        )}

        {shown.includes("quality") && (
          <Removable label="Quality at least (%)" onRemove={() => remove("quality")}>
            <input
              name="minQuality"
              type="number"
              min={0}
              max={100}
              defaultValue={values.minQuality ?? ""}
              placeholder="80"
              aria-label="Minimum quality percentage"
              className={`${control} w-24`}
            />
          </Removable>
        )}

        {shown.includes("followUp") && (
          <Removable label="Follow-up" onRemove={() => remove("followUp")}>
            <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
              <input
                id="requiresFollowUp"
                name="requiresFollowUp"
                type="checkbox"
                defaultChecked={values.requiresFollowUp === "on"}
                className="h-4 w-4"
              />
              Required only
            </label>
          </Removable>
        )}

        {available.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Add filter</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setShown((s) => [...s, e.target.value]);
              }}
              aria-label="Add another filter"
              className={`${control} w-44 text-muted-foreground`}
            >
              <option value="">＋ Add a filter…</option>
              {available.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">
            Apply
          </Button>
          {hasAny && <Button nativeButton={false} size="sm" variant="ghost" render={<Link href={action}>Clear</Link>} />}
        </div>
      </div>
    </form>
  );
}

function Removable({
  label,
  onRemove,
  children,
}: {
  label: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label} filter`}
          className="rounded p-0.5 hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
      {children}
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
