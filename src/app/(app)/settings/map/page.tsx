import { auth } from "@/lib/auth";
import { getNetworkGeoJSON } from "@/server/geo";
import { MAP_FIELDS, getPopupFields } from "@/server/map-settings";
import { PageHeader } from "@/components/layout/page-header";
import { getPageName } from "@/server/navigation";
import { MapPopupEditor } from "./editor";

export default async function MapSettingsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const canEdit = session!.user.roleName === "Administrator";
  const pageTitle = await getPageName(organizationId, "/settings/map", "Map");

  const selected = await getPopupFields(organizationId);

  // One real segment carrying every available field, so the preview shows this
  // network's own values rather than invented ones. Asking for all the fields
  // here is deliberate: the preview has to be able to show anything you tick,
  // not only what is currently saved.
  const all = await getNetworkGeoJSON(
    organizationId,
    undefined,
    MAP_FIELDS.map((f) => f.key)
  );
  const first = all.features[0]?.properties ?? null;
  const sample = first
    ? Object.fromEntries(Object.entries(first).map(([k, v]) => [k, v == null ? "—" : String(v)]))
    : null;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="What the map shows when someone hovers over a segment."
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Map settings are read-only for your role.
        </div>
      )}

      <MapPopupEditor fields={MAP_FIELDS} selected={selected} sample={sample} canEdit={canEdit} />
    </div>
  );
}
