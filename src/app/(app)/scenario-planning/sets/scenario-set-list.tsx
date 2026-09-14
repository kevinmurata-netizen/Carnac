import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { describeWindow } from "@/lib/scenario-sets";
import type { ScenarioSetSummary } from "@/server/scenario-sets";
import { ScenarioSetStatusBadge } from "./status-badge";

/**
 * The sets as rows, shared by Scenario Planning and the Scenario Sets page so
 * the two cannot describe the same set differently.
 */
export function ScenarioSetList({ sets, emptyText }: { sets: ScenarioSetSummary[]; emptyText: React.ReactNode }) {
  if (sets.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="divide-y">
      {sets.map((set) => (
        <li key={set.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/scenario-planning/sets/${set.id}`}
                className="font-medium text-primary hover:underline"
              >
                {set.name}
              </Link>
              <ScenarioSetStatusBadge status={set.status} />
            </div>
            {set.description && <p className="mt-0.5 text-xs text-muted-foreground">{set.description}</p>}
          </div>
          <div className="flex items-center gap-4 text-sm tabular-nums text-muted-foreground">
            <span>{describeWindow(set)}</span>
            <span>
              {formatNumber(set.scenarioCount)} scenario{set.scenarioCount === 1 ? "" : "s"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
