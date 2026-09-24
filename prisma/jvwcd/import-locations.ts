import { PrismaClient } from "@prisma/client";
import { geocodeAll, loadCache, type GeocodeMatch } from "./geocode";
import { drawBand, strandsToWkt, type Strand } from "./corridors";

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

/**
 * A band's runs as one geometry.
 *
 * A MULTILINESTRING, because a diameter band is hundreds of separate pipes and
 * drawing it as a single line says something false about it. The column takes
 * any geometry; the denormalised endpoints keep the first and last point, which
 * is all anything reading those columns wants.
 */
async function writeStrands(prisma: PrismaClient, assetId: string, strands: Strand[]) {
  const wkt = strandsToWkt(strands);
  const first = strands[0][0];
  const last = strands[strands.length - 1][strands[strands.length - 1].length - 1];

  await prisma.$executeRaw`
    INSERT INTO asset_locations (id, "assetId", geometry, "startLat", "startLng", "endLat", "endLng")
    VALUES (
      ${`loc_${assetId}`},
      ${assetId},
      ST_SetSRID(ST_GeomFromText(${wkt}), 4326),
      ${first.lat}, ${first.lng}, ${last.lat}, ${last.lng}
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
  options: { provider: "agrc" | "census"; apiKey?: string; minScore?: number; delayMs?: number }
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
    provider: options.provider,
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
      // What the point is worth, in the asset's own words: who matched it,
      // to what, and whether the same address exists in other cities — which
      // on a Salt Lake grid address it very often does.
      const service = match.provider === "agrc" ? "Utah AGRC" : "the US Census geocoder";
      const others = match.alsoMatchedIn ?? 0;
      const spread = match.spreadFt ?? 0;
      const ambiguity =
        others === 0
          ? ""
          : spread <= 100
            ? ` The same address matched in ${others} other candidate ${others === 1 ? "city" : "cities"} at the same point — Salt Lake's grid crosses city lines, so only the city name is uncertain.`
            : ` The same address matched in ${others} other candidate ${others === 1 ? "city" : "cities"}, and those matches are up to ${spread.toLocaleString("en-US")} ft apart, so this point is the best of several and not a certainty.`;
      await markBasis(
        prisma,
        facility.id,
        facility.assetTypeId,
        `Geocoded from the published address by ${service} (${match.zone}, confidence ${Math.round(match.score)}): ${match.matchAddress}.${ambiguity}`
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
        where: { definition: { code: { in: ["LENGTH", "DIAMETER", "DIAMETER_BAND"] } } },
        select: { numberValue: true, textValue: true, definition: { select: { code: true } } },
      },
    },
  });

  let drawn = 0;
  let strandCount = 0;

  for (const pipe of pipes) {
    const value = (code: string) => pipe.attributeValues.find((v) => v.definition.code === code);
    const lengthFt = value("LENGTH")?.numberValue ?? 0;
    const diameter = value("DIAMETER")?.numberValue ?? null;
    const band = value("DIAMETER_BAND")?.textValue ?? "";
    if (lengthFt <= 0) continue;

    // Drawn along the valley's corridors rather than at a random bearing, and
    // as many strands rather than one line: a band is hundreds of pipes, and a
    // single 57-mile diagonal across the Oquirrhs was wrong in a way anyone
    // could see.
    const strands = drawBand(pipe.assetCode, lengthFt, diameter);
    if (strands.length === 0) continue;

    await writeStrands(prisma, pipe.id, strands);
    await markBasis(
      prisma,
      pipe.id,
      pipe.assetTypeId,
      `Illustrative only. The inventory gives lengths by diameter, not alignments, so this is ${strands.length === 1 ? "one run" : `${strands.length} runs`} totalling the ${band || `${diameter ?? "?"}"`} band's ${Math.round(lengthFt).toLocaleString("en-US")} ft, drawn along ${(diameter ?? 0) >= 20 ? "the valley's trunk corridors" : "the street grid of the member cities"}. It does not follow any real main.`
    );
    drawn++;
    strandCount += strands.length;
  }

  return { drawn, strandCount };
}
