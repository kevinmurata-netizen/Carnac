import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
  id: string;
  assetCode: string;
  status: string;
  geometry: GeoJSON.Geometry;
};

export async function getNetworkGeoJSON(
  organizationId: string,
  assetIds?: string[]
): Promise<GeoJSON.FeatureCollection> {
  if (assetIds && assetIds.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }
  const idFilter = assetIds ? Prisma.sql`AND a.id IN (${Prisma.join(assetIds)})` : Prisma.empty;

  const rows = await prisma.$queryRaw<NetworkFeature[]>(Prisma.sql`
    SELECT a.id, a."assetCode", a.status::text AS status, ST_AsGeoJSON(l.geometry)::json AS geometry
    FROM assets a
    JOIN asset_locations l ON l."assetId" = a.id
    WHERE a."organizationId" = ${organizationId} AND a."deletedAt" IS NULL ${idFilter}
  `);

  return {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: row.geometry,
      properties: { id: row.id, assetCode: row.assetCode, status: row.status },
    })),
  };
}
