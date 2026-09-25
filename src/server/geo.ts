import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConditionBand, type ConditionBand } from "@/domain/waterline/condition";
import { getRiskBand } from "@/domain/waterline/risk";
import { getConditionBands } from "@/server/settings";

export type LineEndpoints = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
};

/**
 * AssetLocation.geometry is an Unsupported("geometry") column — Prisma Client
 * excludes it entirely from generated types, so both writes and geometry reads
 * go through raw SQL. Everything else on the model (depth, serviceArea, ...)
 * still goes through the normal Prisma Client.
 */
export async function insertAssetLineLocation(
  assetId: string,
  endpoints: LineEndpoints,
  extra: { depth?: number | null; serviceArea?: string | null; pressureZone?: string | null }
) {
  const { startLat, startLng, endLat, endLng } = endpoints;
  const id = `loc_${assetId}`;
  await prisma.$executeRaw`
    INSERT INTO asset_locations
      (id, "assetId", geometry, "startLat", "startLng", "endLat", "endLng", depth, "serviceArea", "pressureZone")
    VALUES (
      ${id},
      ${assetId},
      ST_SetSRID(ST_MakeLine(ST_MakePoint(${startLng}, ${startLat}), ST_MakePoint(${endLng}, ${endLat})), 4326),
      ${startLat}, ${startLng}, ${endLat}, ${endLng},
      ${extra.depth ?? null}, ${extra.serviceArea ?? null}, ${extra.pressureZone ?? null}
    )
  `;
}

export type NetworkFeature = {
  installationDate: Date | null;
  serviceArea: string | null;
  pressureZone: string | null;
  condition: number | null;
  riskScore: number | null;
  attributes: Record<string, string | null> | null;
  id: string;
  assetCode: string;
  status: string;
  geometry: GeoJSON.Geometry;
  /** What kind of asset this is. A network of pipes is one type and says
   * nothing by carrying it; a map that also holds reservoirs, wells and pump
   * stations has to be able to tell them apart. */
  assetTypeCode: string;
  assetTypeName: string;
  assetName: string | null;
};

/**
 * Facilities on the map alongside the pipes.
 *
 * A separate call rather than a flag on the one below, because the two ask
 * different questions. The network GeoJSON is "these segments, filtered the way
 * the page is filtered"; this is "everything that is not a pipe and has a
 * position", which no pipe filter should narrow and no pipe filter should hide.
 */
export async function getFacilityGeoJSON(organizationId: string): Promise<GeoJSON.FeatureCollection> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      assetCode: string;
      assetName: string | null;
      status: string;
      assetTypeCode: string;
      assetTypeName: string;
      basis: string | null;
      geometry: GeoJSON.Geometry;
    }>
  >(Prisma.sql`
    SELECT a.id, a."assetCode", a.name AS "assetName", a.status::text AS status,
           t.code AS "assetTypeCode", t.name AS "assetTypeName",
           ST_AsGeoJSON(l.geometry)::json AS geometry,
           (SELECT av."textValue" FROM asset_attribute_values av
              JOIN asset_attribute_definitions d ON d.id = av."definitionId"
             WHERE av."assetId" = a.id AND d.code = 'LOCATION_BASIS') AS basis
    FROM assets a
    JOIN asset_types t ON t.id = a."assetTypeId"
    JOIN asset_locations l ON l."assetId" = a.id
    WHERE a."organizationId" = ${organizationId} AND a."deletedAt" IS NULL AND t.code <> 'WATERLINE'
  `);

  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: row.geometry,
      properties: {
        id: row.id,
        assetCode: row.assetCode,
        label: row.assetName,
        status: row.status,
        assetTypeCode: row.assetTypeCode,
        assetTypeName: row.assetTypeName,
        // Said on the feature itself, so a point that is not a real location
        // can say so in its own hover card rather than only in a legend.
        geolocated: row.basis?.startsWith("Geocoded") ? "Geocoded from the published address" : "Not geolocated",
      },
    })),
  };
}

/**
 * The network as GeoJSON, carrying whatever the hover card is configured to
 * show.
 *
 * Only the requested fields are joined and only they reach the browser: a
 * field switched off under Settings → General → Map is not fetched, so turning
 * the card down also makes the payload smaller rather than merely hiding data
 * that was sent anyway.
 */
export async function getNetworkGeoJSON(
  organizationId: string,
  assetIds?: string[],
  popupFields: string[] = []
): Promise<GeoJSON.FeatureCollection> {
  if (assetIds && assetIds.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }
  const idFilter = assetIds ? Prisma.sql`AND a.id IN (${Prisma.join(assetIds)})` : Prisma.empty;

  const want = new Set(popupFields);

  // The organization's configured bands, so the card agrees with every other
  // number in the app rather than carrying its own thresholds.
  const bands = want.has("conditionBand") ? await getConditionBands(organizationId) : [];
  const needsCondition = want.has("condition") || want.has("conditionBand");
  const needsRisk = want.has("riskScore") || want.has("riskBand");
  const attributeCodes = [
    want.has("material") ? "MATERIAL" : null,
    want.has("diameter") ? "DIAMETER" : null,
    want.has("length") ? "LENGTH" : null,
    want.has("customersServed") ? "CUSTOMERS_SERVED" : null,
    want.has("criticality") ? "CRITICALITY" : null,
  ].filter((c): c is string => c !== null);

  const rows = await prisma.$queryRaw<NetworkFeature[]>(Prisma.sql`
    SELECT a.id, a."assetCode", a.status::text AS status, ST_AsGeoJSON(l.geometry)::json AS geometry,
           a."installationDate" AS "installationDate",
           ${
             want.has("serviceArea") ? Prisma.sql`l."serviceArea"` : Prisma.sql`NULL::text`
           } AS "serviceArea",
           ${
             want.has("pressureZone") ? Prisma.sql`l."pressureZone"` : Prisma.sql`NULL::text`
           } AS "pressureZone",
           ${
             needsCondition
               ? Prisma.sql`(SELECT cm.score FROM condition_measurements cm
                             WHERE cm."assetId" = a.id
                             ORDER BY cm."measurementDate" DESC LIMIT 1)`
               : Prisma.sql`NULL::double precision`
           } AS condition,
           ${
             needsRisk
               ? Prisma.sql`(SELECT ra."riskScore" FROM risk_assessments ra
                             WHERE ra."assetId" = a.id
                             ORDER BY ra."assessmentDate" DESC LIMIT 1)`
               : Prisma.sql`NULL::double precision`
           } AS "riskScore",
           ${
             attributeCodes.length > 0
               ? Prisma.sql`(SELECT jsonb_object_agg(d.code, COALESCE(av."textValue", av."numberValue"::text))
                             FROM asset_attribute_values av
                             JOIN asset_attribute_definitions d ON d.id = av."definitionId"
                             WHERE av."assetId" = a.id AND d.code IN (${Prisma.join(attributeCodes)}))`
               : Prisma.sql`NULL::jsonb`
           } AS attributes
    FROM assets a
    JOIN asset_locations l ON l."assetId" = a.id
    WHERE a."organizationId" = ${organizationId} AND a."deletedAt" IS NULL ${idFilter}
  `);

  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: row.geometry,
      properties: buildProperties(row, want, bands),
    })),
  };
}

function buildProperties(
  row: NetworkFeature,
  want: Set<string>,
  bands: ConditionBand[]
): Record<string, string | number | null> {
  const attrs = (row.attributes ?? {}) as Record<string, string | null>;
  const props: Record<string, string | number | null> = {
    id: row.id,
    assetCode: row.assetCode,
    status: row.status,
  };

  const put = (key: string, value: string | number | null | undefined) => {
    if (want.has(key) && value != null && value !== "") props[key] = value;
  };

  put("material", attrs.MATERIAL);
  put("diameter", attrs.DIAMETER);
  put("length", attrs.LENGTH ? Math.round(Number(attrs.LENGTH)) : null);
  put("customersServed", attrs.CUSTOMERS_SERVED);
  put("criticality", attrs.CRITICALITY);
  put("serviceArea", row.serviceArea);
  put("pressureZone", row.pressureZone);

  if (row.installationDate) {
    const installed = new Date(row.installationDate);
    put("installYear", installed.getUTCFullYear());
    put("age", new Date().getUTCFullYear() - installed.getUTCFullYear());
  }

  if (row.condition != null) {
    put("condition", Math.round(row.condition * 10) / 10);
    put("conditionBand", getConditionBand(row.condition, bands).label);
  }
  if (row.riskScore != null) {
    put("riskScore", Math.round(row.riskScore * 10) / 10);
    put("riskBand", getRiskBand(row.riskScore).label);
  }

  return props;
}

