import Link from "next/link";
import { auth } from "@/lib/auth";
import { listAssets, listMaterials, listServiceAreas, listCriticalities, listCustomerTypes, listPressureZones, flattenAttributes } from "@/server/assets";
import { listSavedFilters } from "@/server/saved-filters";
import { assetFiltersFromParams } from "@/server/grid-params";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { PageHeader } from "@/components/layout/page-header";
import { AssetFilterBar } from "@/components/filters/asset-filter-bar";
import { SavedFilterSelect } from "@/components/filters/saved-filter-select";
import { ColumnHeader } from "@/components/grid/column-header";
import { ExportButton } from "@/components/grid/export-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
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

const STATUS_OPTIONS = Object.values(AssetStatus);

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;

  // Parsed by the same code the export route uses, so the spreadsheet can
  // never disagree with the screen.
  const filters = await assetFiltersFromParams(organizationId, params);

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

  return (
    <div>
      <PageHeader
        title={`${ASSET_LABEL.plural} Inventory`}
        description={`${formatNumber(assets.length)} waterline segment${assets.length === 1 ? "" : "s"} matching current filters`}
        actions={<ExportButton href="/assets/export" count={assets.length} />}
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
        values={params}
        action="/assets"
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <ColumnHeader label={`${ASSET_LABEL.singular} ID`} sortKey="assetCode" />
                <ColumnHeader label="Material" sortKey="material" filterParam="material" options={materials} />
                <ColumnHeader label="Diameter" sortKey="diameter" />
                <ColumnHeader label="Length (ft)" sortKey="length" />
                <ColumnHeader label="Install Year" sortKey="installationDate" />
                <ColumnHeader label="Age" sortKey="age" />
                <ColumnHeader
                  label="Status"
                  sortKey="status"
                  filterParam="status"
                  options={STATUS_OPTIONS}
                />
                <ColumnHeader
                  label="Service Area"
                  sortKey="serviceArea"
                  filterParam="serviceArea"
                  options={serviceAreas}
                />
                <ColumnHeader label="Customers" sortKey="customers" />
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
                    <TableCell>{age ?? "—"}</TableCell>
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
