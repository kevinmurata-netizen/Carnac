import { STATUS_COLORS } from "./status-colors";
import { formatStatus } from "@/lib/format";

export function MapLegend({ title, entries }: { title: string; entries: Array<{ label: string; color: string }> }) {
  return (
    // Top-left: the basemap's attribution occupies the bottom edge and must
    // stay legible, and MapLibre's own controls sit top-right.
    <div className="absolute top-4 left-4 z-10 rounded-lg border bg-card/95 p-3 text-xs shadow-sm backdrop-blur">
      <div className="mb-1.5 font-medium text-foreground">{title}</div>
      <div className="space-y-1">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatusMapLegend() {
  return (
    <MapLegend
      title="Status"
      entries={Object.entries(STATUS_COLORS).map(([status, color]) => ({ label: formatStatus(status), color }))}
    />
  );
}
