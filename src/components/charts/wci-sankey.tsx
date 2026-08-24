"use client";

import { Layer, Rectangle, ResponsiveContainer, Sankey, Tooltip } from "recharts";
import type { WciFlowLink, WciFlowNode } from "@/server/model-results";

/** Green for gaining a band, red for losing one, grey for staying put. The
 * link's own colour carries the story; band colour is on the node blocks. */
const DIRECTION_COLORS = {
  improved: "#16a34a",
  declined: "#dc2626",
  unchanged: "#94a3b8",
} as const;

type NodeDatum = { name: string; color: string; count: number; side: "start" | "end" };

function SankeyNode({
  x,
  y,
  width,
  height,
  index,
  payload,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: NodeDatum & { value: number };
}) {
  const isStart = payload.side === "start";
  // Empty bands still occupy a slot; drawing a label against a zero-height
  // block would just be litter.
  if (height < 1) return null;

  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={payload.color} fillOpacity={0.95} radius={2} />
      <text
        x={isStart ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={isStart ? "end" : "start"}
        dominantBaseline="middle"
        fontSize={12}
        fill="var(--color-foreground)"
      >
        {payload.name}
      </text>
      <text
        x={isStart ? x - 8 : x + width + 8}
        y={y + height / 2 + 14}
        textAnchor={isStart ? "end" : "start"}
        dominantBaseline="middle"
        fontSize={11}
        fill="var(--color-muted-foreground)"
      >
        {payload.value} segments
      </text>
    </Layer>
  );
}

function SankeyLink(props: Record<string, unknown>) {
  const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, index, payload } =
    props as {
      sourceX: number;
      sourceY: number;
      sourceControlX: number;
      targetX: number;
      targetY: number;
      targetControlX: number;
      linkWidth: number;
      index: number;
      payload: { direction: keyof typeof DIRECTION_COLORS };
    };

  return (
    <Layer key={`link-${index}`}>
      <path
        d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        stroke={DIRECTION_COLORS[payload.direction] ?? DIRECTION_COLORS.unchanged}
        strokeWidth={linkWidth}
        strokeOpacity={0.35}
        fill="none"
      />
    </Layer>
  );
}

export function WciSankey({ nodes, links }: { nodes: WciFlowNode[]; links: WciFlowLink[] }) {
  const data = {
    nodes: nodes.map((n) => ({ name: n.label, color: n.color, count: n.count, side: n.side })),
    links: links.map((l) => ({
      source: l.source,
      target: l.target,
      value: l.value,
      direction: l.direction,
      fromBand: l.fromBand,
      toBand: l.toBand,
    })),
  };

  return (
    <ResponsiveContainer width="100%" height={460}>
      <Sankey
        data={data}
        nodePadding={26}
        // Recharts relaxes node positions to minimise ribbon crossings, which
        // reshuffles the bands into different orders on each side. Zero
        // iterations keeps them in the order supplied — best band at the top,
        // worst at the bottom, identically on both sides — so a band lines up
        // with itself and the eye can read movement as vertical travel.
        iterations={0}
        nodeWidth={14}
        margin={{ top: 10, right: 150, bottom: 10, left: 110 }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        node={SankeyNode as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        link={SankeyLink as any}
      >
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-card)",
          }}
        />
      </Sankey>
    </ResponsiveContainer>
  );
}
