import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  listAssets,
  listMaterials,
  listServiceAreas,
  listCriticalities,
  listCustomerTypes,
  listPressureZones,
  listAssetTypes,
  listTypedAssets,
  flattenAttributes,
  type TypedAssetList,
} from "@/server/assets";
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

  // Which kind of asset is being looked at. Waterlines by default, because
  // they are what this app plans; the other types are here to be read.
  const assetTypes = await listAssetTypes(organizationId);
  const selectedType = params.type && assetTypes.some((t) => t.code === params.type) ? params.type : "WATERLINE";
  if (selectedType !== "WATERLINE") {
    const typed = await listTypedAssets(organizationId, selectedType);
    if (typed) return <TypedAssets typed={typed} assetTypes={assetTypes} />;
  }

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
        <AssetTypeTabs types={assetTypes} selected="WATERLINE" />
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

/** The kinds of asset this organization holds, as links. A type with nothing
 * in it is still shown, because an empty Valve list is a fact about the data
 * rather than a missing feature. */
function AssetTypeTabs({
  types,
  selected,
}: {
  types: Array<{ code: string; name: string; count: number }>;
  selected: string;
}) {
  if (types.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {types.map((type) => {
        const active = type.code === selected;
        return (
          <Link
            key={type.code}
            href={type.code === "WATERLINE" ? "/assets" : `/assets?type=${type.code}`}
            className={`rounded-md border px-2.5 py-1 text-sm ${
              active ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {type.name}
            <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">{formatNumber(type.count)}</span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Assets of a type other than waterline, read in that type's own terms.
 *
 * A reservoir has a capacity and an overflow elevation; a well has a setting
 * level and what it produced. None of those fit a grid built around diameter
 * and material, so the columns come from the type's own attribute definitions
 * rather than from anything written here.
 */
function TypedAssets({
  typed,
  assetTypes,
}: {
  typed: TypedAssetList;
  assetTypes: Array<{ code: string; name: string; count: number }>;
}) {
  const format = (value: string | number | boolean | Date | null, unit: string | null) => {
    if (value == null || value === "") return "—";
    // The sources give a year, not a date, and the attribute's own note says so.
    if (value instanceof Date) return String(value.getUTCFullYear());
    if (typeof value === "number") {
      // A currency unit belongs in front of the figure; everything else after.
      if (unit === "$") return `$${formatNumber(value)}`;
      if (unit === "$/AF") return `$${formatNumber(value)}/AF`;
      return `${formatNumber(value)}${unit ? ` ${unit}` : ""}`;
    }
    if (typeof value === "boolean") return value ? "Yes" : "No";
    // A year-by-year series is stored as JSON because the attribute model has
    // no series type. Nobody should have to read braces.
    if (value.startsWith("{") && value.endsWith("}")) {
      try {
        const series = JSON.parse(value) as Record<string, number>;
        return Object.entries(series)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([year, amount]) => `${year}: ${formatNumber(amount)}`)
          .join(" · ");
      } catch {
        return value;
      }
    }
    return value;
  };

  return (
    <div>
      <PageHeader
        title={typed.type.name}
        description={
          typed.type.description ??
          `${formatNumber(typed.rows.length)} ${typed.type.name.toLowerCase()}${typed.rows.length === 1 ? "" : "s"}`
        }
      />

      <div className="mb-4">
        <AssetTypeTabs types={assetTypes} selected={typed.type.code} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell className="font-medium">ID</TableCell>
                  <TableCell className="font-medium">Name</TableCell>
                  <TableCell className="font-medium">Built</TableCell>
                  {typed.columns.map((column) => (
                    <TableCell key={column.code} className="font-medium">
                      {column.label}
                      {column.unit ? <span className="text-muted-foreground"> ({column.unit})</span> : null}
                    </TableCell>
                  ))}
                  <TableCell className="font-medium">Status</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typed.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={typed.columns.length + 4} className="py-10 text-center text-sm text-muted-foreground">
                      Nothing of this kind has been imported yet.
                    </TableCell>
                  </TableRow>
                )}
                {typed.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link href={`/assets/${row.id}`} className="font-medium text-primary hover:underline">
                        {row.assetCode}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72 text-sm">{row.name ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.installationDate ? row.installationDate.getUTCFullYear() : "—"}
                    </TableCell>
                    {typed.columns.map((column) => (
                      <TableCell key={column.code} className="whitespace-nowrap text-sm">
                        {format(row.attributes[column.code] ?? null, column.unit)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status]}>{formatStatus(row.status)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Read-only. Condition, risk and treatment planning are built around waterlines, so these assets carry their own
        attributes but take no part in the model yet.
      </p>
    </div>
  );
}
