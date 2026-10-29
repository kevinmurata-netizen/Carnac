import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getMeasureCodes,
  getMeasureDefinitionFilters,
  type MeasureCodes,
  type MeasureRole,
} from "@/server/measures";
import { getConditionBand, type ConditionBand } from "@/domain/waterline/condition";
import { getRiskBand } from "@/domain/waterline/risk";
import { getConditionBands } from "@/server/settings";

export type LineEndpoints = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
};

/** A line's vertices in order, each [longitude, latitude] as GeoJSON has them. */
export type LinePath = Array<[number, number]>;

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

/**
 * A line asset drawn along its own vertices, as an import's Shape gives them.
 * The first and last are kept as its start and end, as for any other line, so
 * what reads only the endpoints still finds them.
 */
export async function insertAssetPathLocation(
  assetId: string,
  path: LinePath,
  extra: { serviceArea?: string | null } = {}
) {
  const [startLng, startLat] = path[0];
  const [endLng, endLat] = path[path.length - 1];
  const line = JSON.stringify({ type: "LineString", coordinates: path });
  await prisma.$executeRaw`
    INSERT INTO asset_locations
      (id, "assetId", geometry, "startLat", "startLng", "endLat", "endLng", "serviceArea")
    VALUES (
      ${`loc_${assetId}`},
      ${assetId},
      ST_SetSRID(ST_GeomFromGeoJSON(${line}), 4326),
      ${startLat}, ${startLng}, ${endLat}, ${endLng},
      ${extra.serviceArea ?? null}
    )
  `;
}

/** Half a degree of latitude per foot, roughly: what a stand-in line's
 * length is converted with. */
const FEET_PER_DEGREE = 364_000;
/** The stand-in line drawn for a line asset whose type measures no length. */
export const STAND_IN_LENGTH_FT = 10;

/**
 * Where an asset placed from a single position goes, drawn as its type is:
 * a point, or for a line type a short north-south line of its own length,
 * so the geometry column stays consistent with the rest of that network.
 */
export async function insertAssetLocation(
  assetId: string,
  geometry: string,
  point: { lat: number; lng: number },
  lengthFt: number | null,
  extra: { serviceArea?: string | null; pressureZone?: string | null; depth?: number | null } = {}
) {
  if (geometry !== "line") {
    await insertAssetPointLocation(assetId, point, extra);
    return;
  }
  const delta = (lengthFt || STAND_IN_LENGTH_FT) / 2 / FEET_PER_DEGREE;
  await insertAssetLineLocation(
    assetId,
    { startLat: point.lat - delta, startLng: point.lng, endLat: point.lat + delta, endLng: point.lng },
    { serviceArea: extra.serviceArea ?? null, pressureZone: extra.pressureZone ?? null, depth: extra.depth ?? null }
  );
}

/**
 * A facility's position: the same table as the pipes, holding a Point rather
 * than a line. Raw SQL for the same reason as above — geometry is NOT NULL and
 * Prisma excludes the column — and the point is repeated into
 * startLat/startLng so anything reading coordinates without PostGIS still
 * finds them.
 */
export async function insertAssetPointLocation(
  assetId: string,
  point: { lat: number; lng: number },
  extra: { serviceArea?: string | null; pressureZone?: string | null } = {}
) {
  await prisma.$executeRaw`
    INSERT INTO asset_locations
      (id, "assetId", geometry, "startLat", "startLng", "serviceArea", "pressureZone")
    VALUES (
      ${`loc_${assetId}`},
      ${assetId},
      ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326),
      ${point.lat}, ${point.lng},
      ${extra.serviceArea ?? null}, ${extra.pressureZone ?? null}
    )
  `;
}

/** The card fields that are measures, and the role each reads. */
const POPUP_MEASURES: Array<{ field: string; role: MeasureRole }> = [
  { field: "material", role: "material" },
  { field: "diameter", role: "diameter" },
  { field: "length", role: "length" },
  { field: "customersServed", role: "customersServed" },
  { field: "criticality", role: "criticality" },
];

export type NetworkFeature = {
  installationDate: Date | null;
  serviceArea: string | null;
  pressureZone: string | null;
  condition: number | null;
  riskScore: number | null;
  attributes: Record<string, string | null> | null;
  id: string;
  assetCode: string;
  assetTypeId: string;
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
 * the page is filtered"; this is "every asset of a point type that has a
 * position", which no pipe filter should narrow and no pipe filter should hide.
 */
export async function getFacilityGeoJSON(
  organizationId: string,
  assetIds?: string[]
): Promise<GeoJSON.FeatureCollection> {
  if (assetIds && assetIds.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }
  const idFilter = assetIds ? Prisma.sql`AND a.id IN (${Prisma.join(assetIds)})` : Prisma.empty;

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
    WHERE a."organizationId" = ${organizationId} AND a."deletedAt" IS NULL AND t."geometry" = 'point' ${idFilter}
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
        geolocated: positionClaim(row.basis),
      },
    })),
  };
}

/**
 * What the point on the map claims to be.
 *
 * Only a basis that says the position was scattered or drawn illustratively is
 * a position the asset does not really have; the map fades those and the page
 * counts them. Anything else — a geocoded address, or seed data that places its
 * own facilities the way it places its own pipes — is drawn plainly. Reading it
 * the other way round, as "anything not geocoded is suspect", faded every
 * facility in a demo network whose pipes beside it were drawn solid.
 */
function positionClaim(basis: string | null): string {
  if (!basis) return "Mapped position";
  if (/^(Scattered|Illustrative)/i.test(basis)) return "Not geolocated";
  if (basis.startsWith("Geocoded")) return "Geocoded from the published address";
  return "Mapped position";
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
  // The card's measures, through each asset's own type: the attribute codes
  // every type uses for the roles the card shows.
  const measuresOf = await getMeasureCodes(organizationId);
  const definitionFilters = await getMeasureDefinitionFilters(organizationId);
  const wantedRoles = POPUP_MEASURES.filter((m) => want.has(m.field)).map((m) => m.role);
  const attributeCodes = [
    ...new Set(wantedRoles.flatMap((role) => definitionFilters[role].OR.map((p) => p.code))),
  ];

  const rows = await prisma.$queryRaw<NetworkFeature[]>(Prisma.sql`
    SELECT a.id, a."assetCode", a."assetTypeId", a.status::text AS status, ST_AsGeoJSON(l.geometry)::json AS geometry,
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
                             WHERE cm."assetId" = a.id AND cm."assetComponentId" IS NULL
                             ORDER BY cm."measurementDate" DESC LIMIT 1)`
               : Prisma.sql`NULL::double precision`
           } AS condition,
           ${
             needsRisk
               ? Prisma.sql`(SELECT ra."riskScore" FROM risk_assessments ra
                             WHERE ra."assetId" = a.id AND ra."assetComponentId" IS NULL
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
      properties: buildProperties(row, want, bands, measuresOf(row.assetTypeId)),
    })),
  };
}

function buildProperties(
  row: NetworkFeature,
  want: Set<string>,
  bands: ConditionBand[],
  codes: MeasureCodes
): Record<string, string | number | null> {
  const attributes = (row.attributes ?? {}) as Record<string, string | null>;
  const measure = (role: MeasureRole) => {
    const code = codes[role];
    return code ? (attributes[code] ?? null) : null;
  };
  const props: Record<string, string | number | null> = {
    id: row.id,
    assetCode: row.assetCode,
    status: row.status,
  };

  const put = (key: string, value: string | number | null | undefined) => {
    if (want.has(key) && value != null && value !== "") props[key] = value;
  };

  put("material", measure("material"));
  put("diameter", measure("diameter"));
  put("length", measure("length") ? Math.round(Number(measure("length"))) : null);
  put("customersServed", measure("customersServed"));
  put("criticality", measure("criticality"));
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

