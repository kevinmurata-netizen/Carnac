import { auth } from "@/lib/auth";
import Link from "next/link";
import {
  listAssets,
  listMaterials,
  listServiceAreas,
  listCriticalities,
  listCustomerTypes,
  listPressureZones,
  listAssetTypes,
} from "@/server/assets";
import { getFacilityGeoJSON, getNetworkGeoJSON } from "@/server/geo";
import { getPopupFieldsWithLabels } from "@/server/map-settings";
import { getConditionBands } from "@/server/settings";
import { listSavedFilters, matchingAssetIds } from "@/server/saved-filters";
import { PageHeader } from "@/components/layout/page-header";
import { AssetFilterBar } from "@/components/filters/asset-filter-bar";
import { SavedFilterSelect } from "@/components/filters/saved-filter-select";
import { Card, CardContent } from "@/components/ui/card";
import { FACILITY_COLORS, NetworkMap } from "@/components/map/network-map";
import { StatusMapLegend } from "@/components/map/map-legend";
import { formatFeetAsMiles, formatNumber } from "@/lib/format";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { AssetStatus } from "@prisma/client";
import { getPageName } from "@/server/navigation";

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/network", "Network");

  // A saved filter narrows the map to the segments it matches, on top of
  // whatever the filter bar already says. null means the filter has no
  // criteria, so it narrows nothing.
  const savedFilterId = params.savedFilter || undefined;
  const assetIds = savedFilterId
    ? ((await matchingAssetIds(organizationId, savedFilterId)) ?? undefined)
    : undefined;

  const filters = {
    search: params.search || undefined,
    material: params.material || undefined,
    status: (params.status as AssetStatus) || undefined,
    serviceArea: params.serviceArea || undefined,
    criticality: params.criticality || undefined,
    customerType: params.customerType || undefined,
    pressureZone: params.pressureZone || undefined,
    minDiameter: params.minDiameter ? Number(params.minDiameter) : undefined,
    maxDiameter: params.maxDiameter ? Number(params.maxDiameter) : undefined,
    minCustomers: params.minCustomers ? Number(params.minCustomers) : undefined,
    maxCustomers: params.maxCustomers ? Number(params.maxCustomers) : undefined,
    installedAfter: params.installedAfter ? Number(params.installedAfter) : undefined,
    installedBefore: params.installedBefore ? Number(params.installedBefore) : undefined,
    minCondition: params.minCondition ? Number(params.minCondition) : undefined,
    maxCondition: params.maxCondition ? Number(params.maxCondition) : undefined,
    assetIds,
  };

  const [assets, materials, serviceAreas, criticalities, customerTypes, pressureZones, savedFilters] =
    await Promise.all([
      listAssets(organizationId, filters),
      listMaterials(organizationId),
      listServiceAreas(organizationId),
      listCriticalities(organizationId),
      listCustomerTypes(organizationId),
      listPressureZones(organizationId),
      listSavedFilters(organizationId),
    ]);

  const [popupFields, conditionBands] = await Promise.all([
    getPopupFieldsWithLabels(organizationId),
    getConditionBands(organizationId),
  ]);

  // Which kinds of asset the map draws. The filters above are a pipe's —
  // material, diameter, customers served — and none of them means anything for
  // a tank, so this is a separate choice rather than another field in that bar.
  const assetTypes = await listAssetTypes(organizationId);
  const typeParam = params.assetType && assetTypes.some((t) => t.code === params.assetType) ? params.assetType : null;
  const showPipes = typeParam === null || typeParam === "WATERLINE";
  const showFacilities = typeParam === null || typeParam !== "WATERLINE";

  const [pipeFeatures, allFacilities] = await Promise.all([
    showPipes
      ? getNetworkGeoJSON(
          organizationId,
          assets.map((a) => a.id),
          popupFields.map((f) => f.key)
        )
      : Promise.resolve({ type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection),
    showFacilities
      ? getFacilityGeoJSON(organizationId)
      : Promise.resolve({ type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection),
  ]);

  const geojson = pipeFeatures;
  const facilities: GeoJSON.FeatureCollection =
    typeParam && typeParam !== "WATERLINE"
      ? {
          type: "FeatureCollection",
          features: allFacilities.features.filter((f) => f.properties?.assetTypeCode === typeParam),
        }
      : allFacilities;

  const facilityCounts = new Map<string, { name: string; count: number }>();
  for (const feature of facilities.features) {
    const code = String(feature.properties?.assetTypeCode ?? "");
    const name = String(feature.properties?.assetTypeName ?? code);
    const seen = facilityCounts.get(code);
    facilityCounts.set(code, { name, count: (seen?.count ?? 0) + 1 });
  }
  const notGeolocated = facilities.features.filter((f) => f.properties?.geolocated === "Not geolocated").length;

  const totalLengthFt = assets.reduce((sum, asset) => {
    const length = asset.attributeValues.find((av) => av.definition.code === WATERLINE_ATTRIBUTES.LENGTH)?.numberValue;
    return sum + (length ?? 0);
  }, 0);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={
          showPipes
            ? `${formatNumber(assets.length)} segments · ${formatFeetAsMiles(totalLengthFt)}${
                facilities.features.length > 0 ? ` · ${formatNumber(facilities.features.length)} facilities` : ""
              } shown`
            : `${formatNumber(facilities.features.length)} shown`
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <AssetTypeFilter types={assetTypes} selected={typeParam} params={params} />
        <SavedFilterSelect
          filters={savedFilters.map((f) => ({ id: f.id, name: f.name, criteriaCount: f.criteria.length }))}
        />
      </div>

      {/* Material, diameter and customers served are a pipe's filters. With the
          map showing only reservoirs they would narrow nothing and mislead. */}
      {showPipes && (
        <AssetFilterBar
          materials={materials}
          serviceAreas={serviceAreas}
          criticalities={criticalities}
          customerTypes={customerTypes}
          pressureZones={pressureZones}
          conditionBands={conditionBands.map((b) => ({ label: b.label, min: b.min, max: b.max }))}
          alwaysShowCondition
          values={params}
          action="/network"
        />
      )}

      <Card>
        <CardContent className="p-0">
          <div className="relative h-[calc(100vh-19rem)] min-h-[420px] overflow-hidden rounded-lg">
            <NetworkMap
              geojson={geojson}
              facilities={facilities}
              popupFields={popupFields}
              className="h-full w-full"
            />
            {showPipes && <StatusMapLegend />}
            {facilityCounts.size > 0 && <FacilityLegend counts={facilityCounts} />}
          </div>
        </CardContent>
      </Card>

      {notGeolocated > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {formatNumber(notGeolocated)} facilit{notGeolocated === 1 ? "y is" : "ies are"} drawn faded: their published
          address could not be geocoded, so the point is inside the service area for illustration and is not where the
          facility is. Pipe lines are illustrative throughout — the inventory gives lengths by diameter, not alignments.
        </p>
      )}
    </div>
  );
}

/**
 * Which kinds of asset the map draws.
 *
 * Links rather than a form control, so a view is a URL somebody can send. A
 * type with nothing in it is left out: an empty Fire Hydrant filter would only
 * ever produce an empty map.
 */
function AssetTypeFilter({
  types,
  selected,
  params,
}: {
  types: Array<{ code: string; name: string; count: number }>;
  selected: string | null;
  params: Record<string, string | undefined>;
}) {
  const withType = (code: string | null) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "assetType") next.set(key, value);
    }
    if (code) next.set("assetType", code);
    const query = next.toString();
    return query ? `/network?${query}` : "/network";
  };

  // Waterlines lead: they are what this map is mostly of, and what every other
  // filter on the page applies to. The rest follow by name.
  const shown = types
    .filter((t) => t.count > 0)
    .sort((a, b) => (a.code === "WATERLINE" ? -1 : b.code === "WATERLINE" ? 1 : a.name.localeCompare(b.name)));
  if (shown.length < 2) return null;

  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium text-muted-foreground">Asset type</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {[{ code: null as string | null, name: "All", count: shown.reduce((s, t) => s + t.count, 0) }, ...shown].map(
          (type) => {
            const active = type.code === selected;
            return (
              <Link
                key={type.code ?? "all"}
                href={withType(type.code)}
                className={`rounded-md border px-2.5 py-1 text-sm ${
                  active
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {type.name}
                <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">{formatNumber(type.count)}</span>
              </Link>
            );
          }
        )}
      </div>
    </div>
  );
}

/** What the coloured points are. Sits beside the status legend rather than
 * inside it: one says what condition a pipe is in, the other says what a thing
 * is. */
function FacilityLegend({ counts }: { counts: Map<string, { name: string; count: number }> }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 rounded-md border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
      <div className="mb-1 font-medium">Facilities</div>
      <ul className="space-y-1">
        {[...counts].map(([code, { name, count }]) => (
          <li key={code} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-white"
              style={{ backgroundColor: FACILITY_COLORS[code] ?? "#475569" }}
            />
            {name}
            <span className="tabular-nums text-muted-foreground">{formatNumber(count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
