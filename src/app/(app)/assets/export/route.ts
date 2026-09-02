import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAssets, flattenAttributes } from "@/server/assets";
import { listSavedFilters } from "@/server/saved-filters";
import { WATERLINE_ATTRIBUTES } from "@/domain/waterline/attributes";
import { ageInYears, formatStatus } from "@/lib/format";
import { buildWorkbook, excelFileName, XLSX_CONTENT_TYPE, type ExcelColumn } from "@/server/excel";
import { assetFiltersFromParams, paramsFromRequest, describeFilters } from "@/server/grid-params";
import { ASSET_LABEL } from "@/config/labels";

/**
 * Water Inventory as a spreadsheet.
 *
 * Runs the same query the page runs, from the same URL, so the file contains
 * exactly the rows on screen in the same order — filters, saved filter and
 * sort included.
 *
 * The sheet carries more columns than the grid does. The grid is limited by
 * what fits across a screen; a spreadsheet is not, and the fields it adds are
 * the ones people would otherwise go and look up one segment at a time.
 */
const COLUMNS: ExcelColumn[] = [
  { key: "assetCode", header: `${ASSET_LABEL.singular} ID`, type: "text" },
  { key: "name", header: "Name", type: "text" },
  { key: "material", header: "Material", type: "text" },
  { key: "diameter", header: "Diameter (in)", type: "number" },
  { key: "length", header: "Length (ft)", type: "integer" },
  { key: "installDate", header: "Installed", type: "date" },
  { key: "age", header: "Age (years)", type: "integer" },
  { key: "expectedLife", header: "Expected life (years)", type: "integer" },
  { key: "status", header: "Status", type: "text" },
  { key: "serviceArea", header: "Service area", type: "text" },
  { key: "pressureZone", header: "Pressure zone", type: "text" },
  { key: "criticality", header: "Criticality", type: "text" },
  { key: "customersServed", header: "Customers served", type: "integer" },
  { key: "customerType", header: "Customer type", type: "text" },
  { key: "pressureClass", header: "Pressure class", type: "text" },
  { key: "jointType", header: "Joint type", type: "text" },
  { key: "liningType", header: "Lining type", type: "text" },
  { key: "manufacturer", header: "Manufacturer", type: "text" },
  { key: "owner", header: "Owner", type: "text" },
  { key: "department", header: "Responsible department", type: "text" },
];

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const organizationId = session.user.organizationId;
  const params = paramsFromRequest(request);
  const filters = await assetFiltersFromParams(organizationId, params);
  const assets = await listAssets(organizationId, filters);

  const savedFilterName = params.savedFilter
    ? (await listSavedFilters(organizationId)).find((f) => f.id === params.savedFilter)?.name
    : undefined;

  const rows = assets.map((asset) => {
    const attrs = flattenAttributes(asset);
    const attr = (code: string) => attrs[code] ?? null;

    return {
      assetCode: asset.assetCode,
      name: asset.name,
      material: attr(WATERLINE_ATTRIBUTES.MATERIAL) as string | null,
      diameter: attr(WATERLINE_ATTRIBUTES.DIAMETER) as number | null,
      length: attr(WATERLINE_ATTRIBUTES.LENGTH) as number | null,
      installDate: asset.installationDate,
      age: ageInYears(asset.installationDate),
      expectedLife: asset.expectedUsefulLife,
      status: formatStatus(asset.status),
      serviceArea: asset.location?.serviceArea ?? null,
      pressureZone: asset.location?.pressureZone ?? null,
      criticality: attr(WATERLINE_ATTRIBUTES.CRITICALITY) as string | null,
      customersServed: attr(WATERLINE_ATTRIBUTES.CUSTOMERS_SERVED) as number | null,
      customerType: attr(WATERLINE_ATTRIBUTES.CUSTOMER_TYPE) as string | null,
      pressureClass: attr(WATERLINE_ATTRIBUTES.PRESSURE_CLASS) as string | null,
      jointType: attr(WATERLINE_ATTRIBUTES.JOINT_TYPE) as string | null,
      liningType: attr(WATERLINE_ATTRIBUTES.LINING_TYPE) as string | null,
      manufacturer: attr(WATERLINE_ATTRIBUTES.MANUFACTURER) as string | null,
      owner: attr(WATERLINE_ATTRIBUTES.OWNER) as string | null,
      department: asset.ownerDepartment,
    };
  });

  const buffer = await buildWorkbook({
    sheetName: ASSET_LABEL.plural,
    title: `${ASSET_LABEL.plural} Inventory — ${rows.length.toLocaleString()} segments`,
    note: describeFilters(params, savedFilterName),
    columns: COLUMNS,
    rows,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${excelFileName(`${ASSET_LABEL.plural}-inventory`)}"`,
      "Cache-Control": "no-store",
    },
  });
}
