"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatStatus } from "@/lib/format";
import { ASSET_LABEL } from "@/config/labels";
import { X } from "lucide-react";

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "ABANDONED", "PLANNED", "REMOVED"];

const control =
  "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type ConditionBandOption = { label: string; min: number; max: number };

export type AssetFilterValues = {
  search?: string;
  minCondition?: string;
  maxCondition?: string;
  material?: string;
  status?: string;
  serviceArea?: string;
  criticality?: string;
  customerType?: string;
  pressureZone?: string;
  minDiameter?: string;
  maxDiameter?: string;
  minCustomers?: string;
  maxCustomers?: string;
  installedAfter?: string;
  installedBefore?: string;
};

/** Optional filters, added from the dropdown. The four core ones are always
 * shown because they are what people reach for first. */
type OptionalFilter = {
  key: string;
  label: string;
  /** Params this filter owns, so it can be cleared completely when removed. */
  params: string[];
};

const OPTIONAL_FILTERS: OptionalFilter[] = [
  { key: "condition", label: "Condition band", params: ["minCondition", "maxCondition"] },
  { key: "criticality", label: "Criticality", params: ["criticality"] },
  { key: "customerType", label: "Customer Type", params: ["customerType"] },
  { key: "pressureZone", label: "Pressure Zone", params: ["pressureZone"] },
  { key: "diameter", label: "Diameter range", params: ["minDiameter", "maxDiameter"] },
  { key: "customers", label: "Customers served range", params: ["minCustomers", "maxCustomers"] },
  { key: "installed", label: "Installed between", params: ["installedAfter", "installedBefore"] },
];

export function AssetFilterBar({
  materials,
  serviceAreas,
  criticalities,
  customerTypes,
  pressureZones,
  conditionBands = [],
  alwaysShowCondition = false,
  values,
  action,
}: {
  materials: string[];
  serviceAreas: string[];
  criticalities: string[];
  customerTypes: string[];
  pressureZones: string[];
  /** The organization's configured bands, so the choices here are the same
   * ones every other screen grades against. */
  conditionBands?: ConditionBandOption[];
  /** The map is read as "where is the bad pipe", so condition is a standing
   * control there rather than one you have to go and add. */
  alwaysShowCondition?: boolean;
  values: AssetFilterValues;
  action: string;
}) {
  // A filter that already has a value in the URL stays open after submitting,
  // so the bar reflects the query you are actually looking at.
  const [shown, setShown] = useState<string[]>(() =>
    OPTIONAL_FILTERS.filter((f) => f.params.some((p) => values[p as keyof AssetFilterValues])).map((f) => f.key)
  );

  // The select shows band names; these hidden inputs carry the score range it
  // stands for, which is what the server filters on.
  const [band, setBand] = useState<{ min: string; max: string }>({
    min: values.minCondition ?? "",
    max: values.maxCondition ?? "",
  });

  const available = OPTIONAL_FILTERS.filter(
    (f) => !shown.includes(f.key) && !(f.key === "condition" && alwaysShowCondition)
  );

  // A band is submitted as the score range it covers, so the server keeps a
  // single numeric filter rather than needing to know about band names.
  const activeBand =
    conditionBands.find(
      (b) => String(b.min) === (values.minCondition ?? "") && String(b.max) === (values.maxCondition ?? "")
    )?.label ?? "";

  const conditionControl = (
    <select
      id="conditionBand"
      aria-label="Condition band"
      defaultValue={activeBand}
      onChange={(e) => {
        const band = conditionBands.find((b) => b.label === e.target.value);
        setBand(band ? { min: String(band.min), max: String(band.max) } : { min: "", max: "" });
      }}
      className={`${control} w-40`}
    >
      <option value="">Any condition</option>
      {conditionBands.map((b) => (
        <option key={b.label} value={b.label}>
          {b.label} ({b.min}–{b.max})
        </option>
      ))}
    </select>
  );
  const hasAny = Object.values(values).some(Boolean);

  return (
    <form method="get" action={action} className="mb-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="search">
          <input
            id="search"
            name="search"
            defaultValue={values.search}
            placeholder={`${ASSET_LABEL.singular} ID or name`}
            className={`${control} w-48`}
          />
        </Field>

        <Field label="Material" htmlFor="material">
          <Select id="material" name="material" value={values.material} placeholder="All materials" options={materials} />
        </Field>

        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={values.status ?? ""} className={`${control} w-36`}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {formatStatus(s)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Service Area" htmlFor="serviceArea">
          <Select
            id="serviceArea"
            name="serviceArea"
            value={values.serviceArea}
            placeholder="All areas"
            options={serviceAreas}
          />
        </Field>

        {alwaysShowCondition && (
          <Field label="Condition" htmlFor="conditionBand">
            {conditionControl}
          </Field>
        )}

        {shown.includes("condition") && !alwaysShowCondition && (
          <Removable label="Condition" onRemove={() => setShown((s) => s.filter((k) => k !== "condition"))}>
            {conditionControl}
          </Removable>
        )}

        {shown.includes("criticality") && (
          <Removable label="Criticality" onRemove={() => setShown((s) => s.filter((k) => k !== "criticality"))}>
            <Select id="criticality" name="criticality" value={values.criticality} placeholder="Any" options={criticalities} />
          </Removable>
        )}

        {shown.includes("customerType") && (
          <Removable label="Customer Type" onRemove={() => setShown((s) => s.filter((k) => k !== "customerType"))}>
            <Select id="customerType" name="customerType" value={values.customerType} placeholder="Any" options={customerTypes} />
          </Removable>
        )}

        {shown.includes("pressureZone") && (
          <Removable label="Pressure Zone" onRemove={() => setShown((s) => s.filter((k) => k !== "pressureZone"))}>
            <Select id="pressureZone" name="pressureZone" value={values.pressureZone} placeholder="Any" options={pressureZones} />
          </Removable>
        )}

        {shown.includes("diameter") && (
          <Removable label="Diameter (in)" onRemove={() => setShown((s) => s.filter((k) => k !== "diameter"))}>
            <Range minName="minDiameter" maxName="maxDiameter" values={values} />
          </Removable>
        )}

        {shown.includes("customers") && (
          <Removable label="Customers Served" onRemove={() => setShown((s) => s.filter((k) => k !== "customers"))}>
            <Range minName="minCustomers" maxName="maxCustomers" values={values} />
          </Removable>
        )}

        {shown.includes("installed") && (
          <Removable label="Installed (year)" onRemove={() => setShown((s) => s.filter((k) => k !== "installed"))}>
            <Range minName="installedAfter" maxName="installedBefore" values={values} width="w-24" />
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

        <input type="hidden" name="minCondition" value={band.min} />
        <input type="hidden" name="maxCondition" value={band.max} />

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm">
            Apply
          </Button>
          {hasAny && (
            <Button nativeButton={false} size="sm" variant="ghost" render={<Link href={action}>Clear</Link>} />
          )}
        </div>
      </div>
    </form>
  );
}

function Select({
  id,
  name,
  value,
  placeholder,
  options,
}: {
  id: string;
  name: string;
  value?: string;
  placeholder: string;
  options: string[];
}) {
  return (
    <select id={id} name={name} defaultValue={value ?? ""} className={`${control} w-40`}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Range({
  minName,
  maxName,
  values,
  width = "w-20",
}: {
  minName: keyof AssetFilterValues;
  maxName: keyof AssetFilterValues;
  values: AssetFilterValues;
  width?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        name={minName}
        type="number"
        defaultValue={values[minName] ?? ""}
        placeholder="min"
        className={`${control} ${width}`}
        aria-label={`Minimum ${minName}`}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <input
        name={maxName}
        type="number"
        defaultValue={values[maxName] ?? ""}
        placeholder="max"
        className={`${control} ${width}`}
        aria-label={`Maximum ${maxName}`}
      />
    </div>
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
