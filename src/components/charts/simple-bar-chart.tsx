"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency, formatNumber } from "@/lib/format";

/** Format is named rather than passed as a function: this is a Client
 * Component, and React Server Components cannot serialize functions across
 * the boundary. */
export type ValueFormat = "number" | "currency" | "currency-compact";

function applyFormat(value: number, format: ValueFormat | undefined): string | number {
  switch (format) {
    case "currency":
      return formatCurrency(value);
    case "currency-compact":
      return formatCurrency(value, { compact: true });
    case "number":
      return formatNumber(value);
    default:
      return value;
  }
}

export function SimpleBarChart({
  data,
  xKey,
  yKey,
  color = "var(--color-primary)",
  valueFormat,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  color?: string;
  valueFormat?: ValueFormat;
}) {
  // The axis is as wide as its widest label needs, and never wider. Left at a
  // fixed 40px, a value like 4,000,000 was drawn into a gutter that could not
  // hold it and the leading digits were clipped away — an axis of what looked
  // like zeroes. Estimated from the data rather than measured: the ticks are
  // round numbers within the same range, so the longest formatted value is a
  // good upper bound for the longest tick.
  const widest = data.reduce((longest, row) => {
    const label = String(applyFormat(Number(row[yKey]), valueFormat));
    return Math.max(longest, label.length);
  }, 1);
  const axisWidth = Math.min(96, Math.max(32, widest * 7 + 12));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={axisWidth}
          // Ticks read the way the tooltip does: $4.0M rather than 4000000.
          tickFormatter={(value) => String(applyFormat(Number(value), valueFormat))}
        />
        <Tooltip
          cursor={{ fill: "var(--color-muted)" }}
          formatter={(value) => applyFormat(Number(value), valueFormat)}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-card)",
          }}
        />
        <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
