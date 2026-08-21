"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ConditionBand } from "@/domain/waterline/condition";

export function ConditionDistributionChart({
  byBand,
  bands,
}: {
  byBand: Array<{ label: string; count: number }>;
  /** Configured bands, so renaming or recolouring one in Settings shows here. */
  bands: ConditionBand[];
}) {
  const countByLabel = new Map(byBand.map((b) => [b.label, b.count]));
  const data = bands.map((band) => ({ label: band.label, count: countByLabel.get(band.label) ?? 0, color: band.color }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
          axisLine={{ stroke: "var(--color-border)" }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          cursor={{ fill: "var(--color-muted)" }}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-card)",
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
