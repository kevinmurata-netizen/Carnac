import { PrismaClient } from "@prisma/client";
import { geocodeAll, loadCache, type GeocodeMatch } from "./geocode";

/**
 * Where everything sits on the map.
 *
 * Three kinds of location, and the difference between them is the point of this
 * file — a demo that cannot tell a surveyed coordinate from a scattered one is
 * a demo that will eventually be believed:
 *
 * 1. **Geocoded.** A facility whose published street address Utah's geocoder
 *    matched. A real point, with the address it matched and the confidence
 *    recorded on the asset.
 * 2. **Scattered.** A facility whose address did not match. Placed inside the
 *    service area so the map is not full of holes, and marked as not
 *    geolocated, in its attributes and in its description.
 * 3. **Illustrative.** Every pipe. The inventory has no addresses and no
 *    alignments — it is lengths by diameter — so a line here shows that a band
 *    exists and where it roughly serves, and nothing more. No pipe drawn by
 *    this file follows a real main.
 *
 * Scattering is deterministic: the same asset lands in the same place every
 * run, so a re-import does not make the map jump about.
 */

/** JVWCD's service area in the Salt Lake Valley, as a rough box. Only ever
 * used for work that is explicitly not geolocated. */
const SERVICE_AREA = { minLat: 40.46, maxLat: 40.72, minLng: -112.08, maxLng: -111.8 };

export type LocationBasis = "geocoded" | "scattered" | "illustrative";

/** A stable number in [0,1) from a string, so scattering is repeatable. */
function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function scatterPoint(seed: string) {
  const a = hashUnit(seed);
  const b = hashUnit(`${seed}:2`);
  return {
    lat: SERVICE_AREA.minLat + a * (SERVICE_AREA.maxLat - SERVICE_AREA.minLat),
    lng: SERVICE_AREA.minLng + b * (SERVICE_AREA.maxLng - SERVICE_AREA.minLng),
  };
}

async function writePoint(
  prisma: PrismaClient,
  assetId: string,
  point: { lat: number; lng: number },
  extra: { serviceArea?: string | null; pressureZone?: string | null } = {}
) {
  // Start and end are the same point: the column takes any geometry, and the
  // denormalised endpoints are what the rest of the app reads.
  await prisma.$executeRaw`
    INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "endLat", "endLng", "serviceArea", "pressureZone")
    VALUES (
      ${`loc_${assetId}`},
      ${assetId},
      ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326),
      ${point.lat}, ${point.lng}, ${point.lat}, ${point.lng},
      ${extra.serviceArea ?? null}, ${extra.pressureZone ?? null}
    )
    ON CONFLICT ("assetId") DO UPDATE SET
      geometry = EXCLUDED.geometry,
      "startLat" = EXCLUDED."startLat", "startLng" = EXCLUDED."startLng",
      "endLat" = EXCLUDED."endLat", "endLng" = EXCLUDED."endLng",
      "serviceArea" = EXCLUDED."serviceArea", "pressureZone" = EXCLUDED."pressureZone"
  `;
}

async function writeLine(
  prisma: PrismaClient,
  assetId: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  await prisma.$executeRaw`
    INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "endLat", "endLng")
    VALUES (
      ${`loc_${assetId}`},
      ${assetId},
      ST_SetSRID(ST_MakeLine(ST_MakePoint(${from.lng}, ${from.lat}), ST_MakePoint(${to.lng}, ${to.lat})), 4326),
      ${from.lat}, ${from.lng}, ${to.lat}, ${to.lng}
    )
    ON CONFLICT ("assetId") DO UPDATE SET
      geometry = EXCLUDED.geometry,
      "startLat" = EXCLUDED."startLat", "startLng" = EXCLUDED."startLng",
      "endLat" = EXCLUDED."endLat", "endLng" = EXCLUDED."endLng"
  `;
}

/** Record how an asset came by its location, on the asset itself. */
async function markBasis(prisma: PrismaClient, assetId: string, assetTypeId: string, basis: string) {
  const definition = await prisma.assetAttributeDefinition.findUnique({
    where: { assetTypeId_code: { assetTypeId, code: "LOCATION_BASIS" } },
    select: { id: true },
  });
  if (!definition) return;
  await prisma.assetAttributeValue.upsert({
    where: { assetId_definitionId: { assetId, definitionId: definition.id } },
    update: { textValue: basis },
    create: { assetId, definitionId: definition.id, textValue: basis },
  });
}

/**
 * Geocode the facilities and place them. Needs `AGRC_API_KEY`; without it
 * nothing is written, because a map full of scattered points that nobody meant
 * to accept is worse than a map with none.
 */
export async function importFacilityLocations(
  prisma: PrismaClient,
  options: { apiKey: string; minScore?: number; delayMs?: number }
) {
  const facilities = await prisma.asset.findMany({
    where: { assetType: { code: { in: ["RESERVOIR", "WELL", "BOOSTER_PUMP_STATION"] } } },
    select: {
      id: true,
      assetCode: true,
      assetTypeId: true,
      attributeValues: {
        where: { definition: { code: { in: ["ADDRESS", "ZONE"] } } },
        select: { textValue: true, definition: { select: { code: true } } },
      },
    },
  });

  const addressOf = (a: (typeof facilities)[number]) =>
    a.attributeValues.find((v) => v.definition.code === "ADDRESS")?.textValue ?? null;
  const zoneOf = (a: (typeof facilities)[number]) =>
    a.attributeValues.find((v) => v.definition.code === "ZONE")?.textValue ?? null;

  const addresses = facilities.map(addressOf).filter((a): a is string => a != null);
  const report = await geocodeAll(addresses, {
    apiKey: options.apiKey,
    minScore: options.minScore,
    delayMs: options.delayMs ?? 120,
    onProgress: (done, total) => {
      if (done % 10 === 0 || done === total) process.stdout.write(`\r  geocoding ${done}/${total}`);
    },
  });
  process.stdout.write("\n");

  const cache = loadCache();
  let geocoded = 0;
  let scattered = 0;

  for (const facility of facilities) {
    const address = addressOf(facility);
    const cached = address ? cache[address] : undefined;
    const match = cached && !("missed" in cached) ? (cached as GeocodeMatch) : null;

    if (match) {
      await writePoint(prisma, facility.id, match, { serviceArea: match.zone, pressureZone: zoneOf(facility) });
      await markBasis(
        prisma,
        facility.id,
        facility.assetTypeId,
        `Geocoded from the published address by Utah AGRC (${match.zone}, confidence ${Math.round(match.score)}): ${match.matchAddress}`
      );
      geocoded++;
    } else {
      const point = scatterPoint(facility.assetCode);
      await writePoint(prisma, facility.id, point, { pressureZone: zoneOf(facility) });
      await markBasis(
        prisma,
        facility.id,
        facility.assetTypeId,
        address
          ? `Not geolocated. The published address "${address}" did not match, so this point is scattered inside the service area for illustration only.`
          : "Not geolocated. No address was published, so this point is scattered inside the service area for illustration only."
      );
      scattered++;
    }
  }

  return { ...report, geocoded, scattered };
}

/**
 * Give every pipe band an illustrative line.
 *
 * Length is to scale — a 57-mile band draws long — but direction and position
 * are arbitrary, which is why every one of them says so on the asset. Drawn
 * inside the service area and kept there, so a long band folds rather than
 * running off into Tooele County.
 */
export async function importPipeLocations(prisma: PrismaClient) {
  const pipes = await prisma.asset.findMany({
    where: { assetType: { code: "WATERLINE" }, assetCode: { startsWith: "PIPE-" } },
    select: {
      id: true,
      assetCode: true,
      assetTypeId: true,
      attributeValues: {
        where: { definition: { code: "LENGTH" } },
        select: { numberValue: true },
      },
    },
  });

  let drawn = 0;
  for (const pipe of pipes) {
    const lengthFt = pipe.attributeValues[0]?.numberValue ?? 0;
    const start = scatterPoint(pipe.assetCode);
    // Roughly a degree of latitude per 364,000 ft; capped so a band that is
    // tens of miles long stays inside the valley rather than leaving the state.
    const spanDeg = Math.min(0.12, lengthFt / 364000);
    const bearing = hashUnit(`${pipe.assetCode}:bearing`) * Math.PI * 2;
    const end = {
      lat: Math.min(SERVICE_AREA.maxLat, Math.max(SERVICE_AREA.minLat, start.lat + Math.sin(bearing) * spanDeg)),
      lng: Math.min(SERVICE_AREA.maxLng, Math.max(SERVICE_AREA.minLng, start.lng + Math.cos(bearing) * spanDeg * 1.3)),
    };

    await writeLine(prisma, pipe.id, start, end);
    await markBasis(
      prisma,
      pipe.id,
      pipe.assetTypeId,
      "Illustrative only. The inventory gives lengths by diameter, not alignments, so this line shows that the band exists and is drawn to length — it does not follow any real main."
    );
    drawn++;
  }

  return { drawn };
}
