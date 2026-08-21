import Link from "next/link";
import { auth } from "@/lib/auth";
import { listAssets, listMaterials, listServiceAreas, flattenAttributes } from "@/server/assets";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { PageHeader } from "@/components/layout/page-header";
import { AssetFilterBar } from "@/components/filters/asset-filter-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ageInYears, formatInches, formatNumber, formatStatus } from "@/lib/format";
import { AssetStatus } from "@prisma/client";
import { ASSET_LABEL } from "@/config/labels";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ABANDONED: "destructive",
  PLANNED: "outline",
  REMOVED: "outline",
};

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; material?: string; status?: string; serviceArea?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  const filters = {
    search: params.search || undefined,
    material: params.material || undefined,
    status: (params.status as AssetStatus) || undefined,
    serviceArea: params.serviceArea || undefined,
  };

  const [assets, materials, serviceAreas] = await Promise.all([
    listAssets(organizationId, filters),
    listMaterials(organizationId),
    listServiceAreas(organizationId),
  ]);

  return (
    <div>
      <PageHeader
        title={`${ASSET_LABEL.plural} Inventory`}
        description={`${formatNumber(assets.length)} waterline segment${assets.length === 1 ? "" : "s"} matching current filters`}
      />

      <AssetFilterBar materials={materials} serviceAreas={serviceAreas} values={params} action="/assets" />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ASSET_LABEL.singular} ID</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Diameter</TableHead>
                <TableHead>Length (ft)</TableHead>
                <TableHead>Install Year</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Service Area</TableHead>
                <TableHead>Customers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    No waterline segments match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {assets.map((asset) => {
                const attrs = flattenAttributes(asset);
                const age = ageInYears(asset.installationDate);
                return (
                  <TableRow key={asset.id}>
                    <TableCell>
                      <Link href={`/assets/${asset.id}`} className="font-medium text-primary hover:underline">
                        {asset.assetCode}
                      </Link>
                    </TableCell>
                    <TableCell>{(attrs[WATERLINE_ATTRIBUTES.MATERIAL] as string) ?? "—"}</TableCell>
                    <TableCell>{formatInches(attrs[WATERLINE_ATTRIBUTES.DIAMETER] as number)}</TableCell>
                    <TableCell>{formatNumber(Math.round((attrs[WATERLINE_ATTRIBUTES.LENGTH] as number) ?? 0))}</TableCell>
                    <TableCell>{asset.installationDate ? asset.installationDate.getFullYear() : "—"}</TableCell>
                    <TableCell>{age != null ? `${age} yr` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[asset.status]}>{formatStatus(asset.status)}</Badge>
                    </TableCell>
                    <TableCell>{asset.location?.serviceArea ?? "—"}</TableCell>
                    <TableCell>
                      {attrs[WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED]
                        ? formatNumber(attrs[WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED] as number)
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
