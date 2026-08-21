import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatStatus } from "@/lib/format";
import { ASSET_LABEL } from "@/config/labels";

const STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "ABANDONED", "PLANNED", "REMOVED"];

export function AssetFilterBar({
  materials,
  serviceAreas,
  values,
  action,
}: {
  materials: string[];
  serviceAreas: string[];
  values: { search?: string; material?: string; status?: string; serviceArea?: string };
  action: string;
}) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
      <Field label="Search" htmlFor="search">
        <input
          id="search"
          name="search"
          defaultValue={values.search}
          placeholder={`${ASSET_LABEL.singular} ID or name`}
          className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>
      <Field label="Material" htmlFor="material">
        <select
          id="material"
          name="material"
          defaultValue={values.material ?? ""}
          className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All materials</option>
          {materials.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status" htmlFor="status">
        <select
          id="status"
          name="status"
          defaultValue={values.status ?? ""}
          className="h-9 w-36 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {formatStatus(s)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Service Area" htmlFor="serviceArea">
        <select
          id="serviceArea"
          name="serviceArea"
          defaultValue={values.serviceArea ?? ""}
          className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">All areas</option>
          {serviceAreas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Apply
        </Button>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={action}>Reset</Link>} />
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}
