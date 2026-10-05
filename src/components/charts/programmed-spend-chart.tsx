"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/format";

/**
 * A year's spending in two parts — programmed work locked in from a work
 * plan, and what the annual allocation bought — stacked against the year's
 * budget, so it reads at a glance whether programmed work came out of the
 * budget or sat on top of it.
 */
export function ProgrammedSpendChart({
  data,
  height = 260,
}: {
  data: Array<{ year: number; programmed: number; allocation: number; budget: number }>;
  height?: number;
}) {
  const money = (v: number) => formatCurrency(v, { compact: true });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={money}
        />
        <Tooltip
          formatter={(value) => money(Number(value))}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-card)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="programmed" name="Programmed work" stackId="spend" fill="var(--color-chart-4)" />
        <Bar dataKey="allocation" name="Annual allocation spending" stackId="spend" fill="var(--color-chart-1)" />
        <Line
          type="monotone"
          dataKey="budget"
          name="Annual budget"
          stroke="var(--color-chart-3)"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
