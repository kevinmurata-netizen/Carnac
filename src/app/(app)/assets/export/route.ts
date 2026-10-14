import { NextResponse } from "next/server";
import { getMeasureCodes, readMeasures } from "@/server/measures";
import { auth } from "@/lib/auth";
import { listAssets, flattenAttributes } from "@/server/assets";
import { listSavedFilters } from "@/server/saved-filters";
import { prisma } from "@/lib/prisma";
import { ageInYears, formatStatus } from "@/lib/format";
import { buildWorkbook, excelFileName, XLSX_CONTENT_TYPE, type ExcelColumn } from "@/server/excel";
import { assetFiltersFromParams, inventoryTypeFromParams, paramsFromRequest, describeFilters } from "@/server/grid-params";
import { getAssetWords } from "@/server/branding";
import type { MeasureLabels } from "@/lib/measure-labels";
import { getMeasureLabels } from "@/server/measures";
import type { AssetWords } from "@/lib/branding";

/**
 * Water Inventory as a spreadsheet.
 *
 * Runs the same query the page runs, from the same URL, so the file contains
 * exactly the rows on screen in the same order — filters, saved filter and
 * sort included.
 *
 * The sheet carries more columns than the grid does. The grid is limited by
 * what fits across a screen; a spreadsheet is not, and the fields it adds are
 * the ones people would otherwise go and look up one segment at a time: each
 * exported asset type's own attributes, beyond the measures already shown.
 */
const columnsFor = (words: AssetWords, measures: MeasureLabels): ExcelColumn[] => [
  { key: "assetCode", header: `${words.singular} ID`, type: "text" },
  { key: "name", header: "Name", type: "text" },
  { key: "material", header: "Material", type: "text" },
  { key: "diameter", header: measures.diameter.heading, type: "number" },
  { key: "length", header: measures.length.heading, type: "integer" },
  { key: "installDate", header: "Installed", type: "date" },
  { key: "age", header: "Age (years)", type: "integer" },
  { key: "expectedLife", header: "Expected life (years)", type: "integer" },
  { key: "status", header: "Status", type: "text" },
  { key: "serviceArea", header: "Service area", type: "text" },
  { key: "pressureZone", header: "Pressure zone", type: "text" },
  { key: "criticality", header: "Criticality", type: "text" },
  { key: "customersServed", header: "Customers served", type: "integer" },
  { key: "customerType", header: "Customer type", type: "text" },
];
const DEPARTMENT: ExcelColumn = { key: "department", header: "Responsible department", type: "text" };

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const organizationId = session.user.organizationId;
  const words = await getAssetWords(organizationId);
  const params = paramsFromRequest(request);
  const inventoryType = await inventoryTypeFromParams(organizationId, params);
  const filters = { ...(await assetFiltersFromParams(organizationId, params)), assetTypeId: inventoryType?.id };
  const [assets, measuresOf] = await Promise.all([listAssets(organizationId, filters), getMeasureCodes(organizationId)]);

  // The other attributes of the asset types being exported, one column per
  // label, in each type's own order. A measure is already a column above.
  const typeIds = [...new Set(assets.map((a) => a.assetTypeId))];
  const definitions = await prisma.assetAttributeDefinition.findMany({
    where: { assetTypeId: { in: typeIds } },
    select: { assetTypeId: true, code: true, label: true, dataType: true },
    orderBy: [{ assetType: { name: "asc" } }, { sortOrder: "asc" }],
  });
  const extra: ExcelColumn[] = [];
  const codeFor = new Map<string, string>(); // `${typeId}|${columnKey}` -> attribute code
  for (const d of definitions) {
    if (Object.values(measuresOf(d.assetTypeId)).includes(d.code)) continue;
    let column = extra.find((c) => c.header === d.label);
    if (!column) {
      column = {
        key: `attr_${extra.length}`,
        header: d.label,
        type: d.dataType === "NUMBER" ? "number" : d.dataType === "DATE" ? "date" : "text",
      };
      extra.push(column);
    }
    codeFor.set(`${d.assetTypeId}|${column.key}`, d.code);
  }

  const savedFilterName = params.savedFilter
    ? (await listSavedFilters(organizationId)).find((f) => f.id === params.savedFilter)?.name
    : undefined;

  const rows = assets.map((asset) => {
    const attrs = flattenAttributes(asset);
    const attr = (columnKey: string) => {
      const code = codeFor.get(`${asset.assetTypeId}|${columnKey}`);
      const value = code ? (attrs[code] ?? null) : null;
      return typeof value === "boolean" ? (value ? "Yes" : "No") : value;
    };
    const m = readMeasures(asset.attributeValues, measuresOf(asset.assetTypeId));

    return {
      assetCode: asset.assetCode,
      name: asset.name,
      material: m.material,
      diameter: m.diameter,
      length: m.length,
      installDate: asset.installationDate,
      age: ageInYears(asset.installationDate),
      expectedLife: asset.expectedUsefulLife,
      status: formatStatus(asset.status),
      serviceArea: asset.location?.serviceArea ?? null,
      pressureZone: asset.location?.pressureZone ?? null,
      criticality: m.criticality,
      customersServed: m.customersServed,
      customerType: m.customerType,
      ...Object.fromEntries(extra.map((c) => [c.key, attr(c.key)])),
      department: asset.ownerDepartment,
    };
  });

  const buffer = await buildWorkbook({
    sheetName: words.plural,
    title: `${words.singular} Inventory — ${rows.length.toLocaleString()} ${words.items}`,
    note: describeFilters(params, savedFilterName),
    columns: [...columnsFor(words, await getMeasureLabels(organizationId, inventoryType?.id)), ...extra, DEPARTMENT],
    rows,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${excelFileName(`${words.plural}-inventory`)}"`,
      "Cache-Control": "no-store",
    },
  });
}
