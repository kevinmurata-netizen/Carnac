import { auth } from "@/lib/auth";
import { listAssets, listMaterials, listServiceAreas, listCriticalities, listCustomerTypes, listPressureZones } from "@/server/assets";
import { getNetworkGeoJSON } from "@/server/geo";
import { getPopupFieldsWithLabels } from "@/server/map-settings";
import { getConditionBands } from "@/server/settings";
import { listSavedFilters, matchingAssetIds } from "@/server/saved-filters";
import { PageHeader } from "@/components/layout/page-header";
import { AssetFilterBar } from "@/components/filters/asset-filter-bar";
import { SavedFilterSelect } from "@/components/filters/saved-filter-select";
import { Card, CardContent } from "@/components/ui/card";
import { NetworkMap } from "@/components/map/network-map";
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

  const geojson = await getNetworkGeoJSON(
    organizationId,
    assets.map((a) => a.id),
    popupFields.map((f) => f.key)
  );

  const totalLengthFt = assets.reduce((sum, asset) => {
    const length = asset.attributeValues.find((av) => av.definition.code === WATERLINE_ATTRIBUTES.LENGTH)?.numberValue;
    return sum + (length ?? 0);
  }, 0);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`${formatNumber(assets.length)} segments · ${formatFeetAsMiles(totalLengthFt)} shown`}
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <SavedFilterSelect
          filters={savedFilters.map((f) => ({ id: f.id, name: f.name, criteriaCount: f.criteria.length }))}
        />
      </div>

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

      <Card>
        <CardContent className="p-0">
          <div className="relative h-[calc(100vh-19rem)] min-h-[420px] overflow-hidden rounded-lg">
            <NetworkMap geojson={geojson} popupFields={popupFields} className="h-full w-full" />
            <StatusMapLegend />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
