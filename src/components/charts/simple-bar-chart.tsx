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
          width={40}
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
