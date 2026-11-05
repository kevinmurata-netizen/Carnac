import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getPageName } from "@/server/navigation";
import {
  DISTANCE_RANGE,
  WINDOW_RANGE,
  getCorridorConfig,
  previewCorridors,
} from "@/server/corridors";
import { MAX_SAVING_PCT } from "@/domain/waterline/corridor";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { CorridorForm } from "./corridor-form";
import { saveCorridorAction } from "./actions";

/**
 * Corridor bundling: which assets are neighbours, and what doing their work
 * together saves. Scenarios bundle only once they opt in; until then this is
 * configuration and a preview.
 */
export default async function CorridorBundlingPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const [pageTitle, config] = await Promise.all([
    getPageName(organizationId, "/settings/corridor-bundling", "Corridor Bundling"),
    getCorridorConfig(organizationId),
  ]);
  const { canWrite: canEdit } = await requireCard("/settings/corridor-bundling");
  const preview = await previewCorridors(organizationId, config);
  const name = new Map(config.types.map((t) => [t.id, t.name]));

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Which assets are close enough that doing their work together saves money, and what it saves"
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Corridor bundling is read-only for your role.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="pt-6">
            <CorridorForm
              config={config}
              ranges={{ distance: DISTANCE_RANGE, window: WINDOW_RANGE, maxSavingPct: MAX_SAVING_PCT }}
              canEdit={canEdit}
              action={saveCorridorAction}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What these settings find</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>
              <span className="text-2xl font-semibold tabular-nums">{formatNumber(preview.withNeighbours)}</span>{" "}
              <span className="text-muted-foreground">
                of {formatNumber(preview.assets)} modelled assets have at least one neighbour within{" "}
                {config.distanceMeters} m.
              </span>
            </p>
            {preview.pairs.length > 0 ? (
              <table className="w-full">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-1 font-medium">Neighbouring pairs</th>
                    <th className="pb-1 text-right font-medium">Pairs</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.pairs.map((p) => (
                    <tr key={`${p.assetTypeAId}|${p.assetTypeBId}`} className="border-t">
                      <td className="py-1.5">
                        {name.get(p.assetTypeAId)} + {name.get(p.assetTypeBId)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatNumber(p.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-muted-foreground">No two assets are neighbours at this distance.</p>
            )}
            {preview.attributeCoverage.map((c) => (
              <p key={c.assetTypeId} className="text-xs text-muted-foreground">
                {name.get(c.assetTypeId)}: {formatNumber(c.recorded)} of {formatNumber(c.of)} record its corridor
                attribute; the rest are placed by distance.
              </p>
            ))}
            {preview.unlocated > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatNumber(preview.unlocated)} assets have no location, so only a corridor attribute can place them.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Pipes meet at junctions, so by distance alone a main neighbours the mains on the cross streets too. A
              corridor attribute such as the street keeps a bundle to one street.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
