import { AssetStatus } from "@prisma/client";
import { matchingAssetIds } from "@/server/saved-filters";
import { parseDateInput } from "@/lib/format";
import type { AssetFilters } from "@/server/assets";
import type { InspectionFilters } from "@/server/inspections";

/**
 * Turns a grid's URL into the filters its query runs on.
 *
 * Shared by the page and its export route on purpose. An export that quietly
 * disagreed with the screen would be worse than no export: someone would take
 * the spreadsheet away and act on a different set of segments than the one
 * they were looking at. One parser means that cannot drift.
 */

export type GridParams = Record<string, string | undefined>;

export async function assetFiltersFromParams(
  organizationId: string,
  params: GridParams
): Promise<AssetFilters> {
  const savedFilterId = params.savedFilter || undefined;
  const assetIds = savedFilterId
    ? ((await matchingAssetIds(organizationId, savedFilterId)) ?? undefined)
    : undefined;

  return {
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
    sort: params.sort || undefined,
    dir: params.dir === "desc" ? "desc" : "asc",
  };
}

export async function inspectionFiltersFromParams(
  organizationId: string,
  params: GridParams
): Promise<InspectionFilters> {
  const savedFilterId = params.savedFilter || undefined;
  const assetIds = savedFilterId
    ? ((await matchingAssetIds(organizationId, savedFilterId)) ?? undefined)
    : undefined;

  const minQuality = params.minQuality ? Number(params.minQuality) / 100 : undefined;

  return {
    search: params.search || undefined,
    inspectionType: params.inspectionType || undefined,
    inspector: params.inspector || undefined,
    requiresFollowUp: params.requiresFollowUp === "on",
    after: params.after ? (parseDateInput(params.after) ?? undefined) : undefined,
    before: params.before ? (parseDateInput(params.before) ?? undefined) : undefined,
    minQuality: Number.isFinite(minQuality) ? minQuality : undefined,
    assetIds,
    sort: params.sort || undefined,
    dir: params.dir === "desc" ? "desc" : "asc",
  };
}

/** Reads a request's query string into the same shape a page receives. */
export function paramsFromRequest(request: Request): GridParams {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

/** A one-line description of what was filtered, written onto the sheet so an
 * extract is never mistaken for the whole network. */
export function describeFilters(params: GridParams, savedFilterName?: string): string {
  const parts: string[] = [];
  if (savedFilterName) parts.push(`saved filter "${savedFilterName}"`);
  if (params.search) parts.push(`search "${params.search}"`);
  if (params.material) parts.push(params.material);
  if (params.status) parts.push(params.status);
  if (params.serviceArea) parts.push(params.serviceArea);
  if (params.criticality) parts.push(`criticality ${params.criticality}`);
  if (params.customerType) parts.push(params.customerType);
  if (params.pressureZone) parts.push(params.pressureZone);
  if (params.inspectionType) parts.push(params.inspectionType);
  if (params.inspector) parts.push(`inspected by ${params.inspector}`);
  if (params.requiresFollowUp === "on") parts.push("follow-up required");
  if (params.minCondition || params.maxCondition) {
    parts.push(`condition ${params.minCondition ?? "0"}–${params.maxCondition ?? "100"}`);
  }
  if (params.minDiameter || params.maxDiameter) {
    parts.push(`diameter ${params.minDiameter ?? "any"}–${params.maxDiameter ?? "any"} in`);
  }

  const exported = `Exported ${new Date().toISOString().slice(0, 10)}`;
  return parts.length === 0 ? `${exported} · no filters applied` : `${exported} · filtered by ${parts.join(", ")}`;
}
