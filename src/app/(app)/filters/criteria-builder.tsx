"use client";

import { Button } from "@/components/ui/button";
import { OPERATORS, operatorsFor, type Criterion, type FilterField, type FilterTable } from "@/server/filter-schema";
import { Plus, X } from "lucide-react";

const control =
  "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CriteriaBuilder({
  schema,
  fieldsByKey,
  criteria,
  matchAll,
  onChange,
  onMatchAllChange,
}: {
  schema: FilterTable[];
  fieldsByKey: Map<string, FilterField>;
  criteria: Criterion[];
  matchAll: boolean;
  onChange: (next: Criterion[]) => void;
  onMatchAllChange: (next: boolean) => void;
}) {
  const update = (i: number, patch: Partial<Criterion>) =>
    onChange(criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const add = () =>
    onChange([...criteria, { field: schema[0]?.fields[0]?.key ?? "", operator: "eq", value: "" }]);

  return (
    <div className="space-y-3">
      {criteria.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Match</span>
          <select
            value={matchAll ? "all" : "any"}
            onChange={(e) => onMatchAllChange(e.target.value === "all")}
            className={`${control} h-8`}
            aria-label="Match all or any criteria"
          >
            <option value="all">all of these</option>
            <option value="any">any of these</option>
          </select>
        </div>
      )}

      {criteria.length === 0 ? (
        <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          No criteria — every segment is included.
        </div>
      ) : (
        <ul className="space-y-2">
          {criteria.map((c, i) => {
            const field = fieldsByKey.get(c.field);
            const type = field?.type ?? "text";
            const allowed = operatorsFor(type);
            const spec = OPERATORS.find((o) => o.key === c.operator);
            const takesValues = spec?.values ?? 1;

            return (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <select
                  value={c.field}
                  onChange={(e) => {
                    // Changing the field can invalidate the operator — "greater
                    // than" makes no sense on text — so fall back to equals.
                    const nextType = fieldsByKey.get(e.target.value)?.type ?? "text";
                    const stillValid = operatorsFor(nextType).some((o) => o.key === c.operator);
                    update(i, { field: e.target.value, operator: stillValid ? c.operator : "eq" });
                  }}
                  className={`${control} min-w-[180px] flex-1`}
                  aria-label="Field"
                >
                  {schema.map((t) => (
                    <optgroup key={t.key} label={t.label}>
                      {t.fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <select
                  value={c.operator}
                  onChange={(e) => update(i, { operator: e.target.value as Criterion["operator"] })}
                  className={`${control} min-w-[150px]`}
                  aria-label="Comparison"
                >
                  {allowed.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {takesValues >= 1 && (
                  <input
                    value={c.value}
                    onChange={(e) => update(i, { value: e.target.value })}
                    type={type === "date" ? "date" : type === "number" && c.operator !== "in" && c.operator !== "nin" ? "number" : "text"}
                    placeholder={
                      c.operator === "in" || c.operator === "nin" ? "comma, separated, values" : "value"
                    }
                    list={field?.options ? `opts-${i}` : undefined}
                    className={`${control} min-w-[140px] flex-1`}
                    aria-label="Value"
                  />
                )}

                {field?.options && (
                  <datalist id={`opts-${i}`}>
                    {field.options.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                )}

                {takesValues === 2 && (
                  <>
                    <span className="text-xs text-muted-foreground">and</span>
                    <input
                      value={c.value2 ?? ""}
                      onChange={(e) => update(i, { value2: e.target.value })}
                      type={type === "date" ? "date" : "number"}
                      className={`${control} min-w-[120px] flex-1`}
                      aria-label="Upper value"
                    />
                  </>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(criteria.filter((_, idx) => idx !== i))}
                  aria-label="Remove criterion"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Button type="button" size="sm" variant="outline" onClick={add}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add criterion
      </Button>
    </div>
  );
}
