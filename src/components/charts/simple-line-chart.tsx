"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type LineSeries = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  /** Render a marker at each point. Essential for sparse series — a series
   * with a single data point draws no visible line, so without dots the
   * legend promises a line the reader can never see. */
  showDots?: boolean;
};

export function SimpleLineChart({
  data,
  xKey,
  series,
  height = 260,
  yDomain,
  referenceY,
  referenceLabel,
}: {
  data: Array<Record<string, string | number | null>>;
  xKey: string;
  series: LineSeries[];
  height?: number;
  yDomain?: [number, number];
  referenceY?: number;
  referenceLabel?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
          domain={yDomain}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-card)",
          }}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {referenceY != null && (
          <ReferenceLine
            y={referenceY}
            stroke="var(--color-muted-foreground)"
            strokeDasharray="6 4"
            label={
              referenceLabel
                ? { value: referenceLabel, position: "insideTopRight", fontSize: 11, fill: "var(--color-muted-foreground)" }
                : undefined
            }
          />
        )}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "6 4" : undefined}
            dot={s.showDots ? { r: 3, fill: s.color } : false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
