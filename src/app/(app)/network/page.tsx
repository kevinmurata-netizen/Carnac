import { auth } from "@/lib/auth";
import { listAssets, listMaterials, listServiceAreas, listCriticalities, listCustomerTypes, listPressureZones } from "@/server/assets";
import { getNetworkGeoJSON } from "@/server/geo";
import { PageHeader } from "@/components/layout/page-header";
import { AssetFilterBar } from "@/components/filters/asset-filter-bar";
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
  };

  const [assets, materials, serviceAreas, criticalities, customerTypes, pressureZones] = await Promise.all([
    listAssets(organizationId, filters),
    listMaterials(organizationId),
    listServiceAreas(organizationId),
    listCriticalities(organizationId),
    listCustomerTypes(organizationId),
    listPressureZones(organizationId),
  ]);

  const geojson = await getNetworkGeoJSON(
    organizationId,
    assets.map((a) => a.id)
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

      <AssetFilterBar
                materials={materials}
              serviceAreas={serviceAreas}
              criticalities={criticalities}
              customerTypes={customerTypes}
              pressureZones={pressureZones}
              values={params}
              action="/network"
            />

      <Card>
        <CardContent className="p-0">
          <div className="relative h-[calc(100vh-19rem)] min-h-[420px] overflow-hidden rounded-lg">
            <NetworkMap geojson={geojson} className="h-full w-full" />
            <StatusMapLegend />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
