"use client";

import { Label } from "@/components/ui/label";
import type { VisitField } from "@/server/component-inspections";

const control =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * One answer on a component's inspection form, typed by its field: a number
 * with its unit and range, a choice, yes/no, a date or text. Shared by the
 * visit form and by correcting a finding afterwards, so the two ask the same
 * question the same way.
 */
export function ReadingInput({ field, name, defaultValue }: { field: VisitField; name: string; defaultValue?: string }) {
  const id = name.replace(/:/g, "-");
  const label = `${field.label}${field.unit ? ` (${field.unit})` : ""}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {field.isRequired && <span className="text-destructive"> *</span>}
      </Label>
      {field.dataType === "ENUM" || field.dataType === "BOOLEAN" ? (
        <select id={id} name={name} defaultValue={defaultValue ?? ""} required={field.isRequired} className={control}>
          <option value="">Not recorded</option>
          {field.dataType === "BOOLEAN" ? (
            <>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </>
          ) : (
            field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))
          )}
        </select>
      ) : (
        <input
          id={id}
          name={name}
          type={field.dataType === "NUMBER" ? "number" : field.dataType === "DATE" ? "date" : "text"}
          step={field.dataType === "NUMBER" ? "any" : undefined}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          required={field.isRequired}
          defaultValue={defaultValue ?? ""}
          className={control}
        />
      )}
      {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
    </div>
  );
}
