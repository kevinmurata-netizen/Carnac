import { AssetWithAttributes } from "@/server/assets";

function formatValue(value: string | number | boolean | Date | null): string {
  if (value == null) return "—";
  if (value instanceof Date) return value.toLocaleDateString("en-US");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function AttributeGrid({ asset }: { asset: AssetWithAttributes }) {
  const sorted = [...asset.attributeValues].sort((a, b) => a.definition.sortOrder - b.definition.sortOrder);

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {sorted.map((av) => {
        const value = av.textValue ?? av.numberValue ?? av.dateValue ?? av.booleanValue ?? null;
        const unit = av.definition.unit;
        return (
          <div key={av.id}>
            <dt className="text-xs font-medium text-muted-foreground">{av.definition.label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-foreground">
              {formatValue(value)}
              {unit && value != null ? ` ${unit}` : ""}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
