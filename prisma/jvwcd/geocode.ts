import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_DATA_DIR } from "./csv";

/**
 * Turning JVWCD's published street addresses into points, through Utah's own
 * geocoder.
 *
 * The District's facility coordinates are GRAMA-protected and are not in any of
 * these files. The addresses are not: they are ordinary Salt Lake County street
 * addresses printed in a public annual report, and geocoding one is the same
 * act as typing it into a map.
 *
 * Two things make this harder than it sounds:
 *
 * **The addresses have no city.** "4500 S 4800 W." is a grid address that
 * exists in several Salt Lake Valley cities, and AGRC's geocoder needs a zone.
 * So each address is tried against JVWCD's member cities and the best-scoring
 * match is kept, with the city it matched recorded beside it.
 *
 * **Some carry a plant name** — "15305 S. 3200 W. (JVWTP)" — which is helpful
 * to a reader and meaningless to a geocoder, so it is stripped and kept.
 *
 * Every answer is cached to a file next to the CSVs. A re-run then costs no
 * requests, and the matches can be read and corrected by hand rather than being
 * a black box inside a script.
 */

const CACHE_FILE = "geocode-cache.json";
const ENDPOINT = "https://api.mapserv.utah.gov/api/v1/geocode";

/** JVWCD's service area, as the cities its water actually reaches. Tried in
 * this order, which puts the larger member cities first. */
export const CANDIDATE_ZONES = [
  "West Jordan",
  "West Valley City",
  "Taylorsville",
  "South Jordan",
  "Sandy",
  "Riverton",
  "Herriman",
  "Draper",
  "Midvale",
  "Kearns",
  "Magna",
  "Bluffdale",
  "Murray",
  "Salt Lake City",
  // East-bench cities. Added after the first run left College Dr, Newbury Dr
  // and 8600 S unmatched: several of the District's facilities sit in cities
  // that are not its member agencies.
  "Cottonwood Heights",
  "Holladay",
  "Millcreek",
  "South Salt Lake",
  "White City",
  "Copperton",
];

export type GeocodeMatch = {
  lat: number;
  lng: number;
  /** AGRC's confidence, 0-100. The Census geocoder publishes none, so a match
   * there is recorded as 100 when the house number and street agree and 80
   * when only the street does. */
  score: number;
  /** What it matched, which is not always what was asked for. */
  matchAddress: string;
  zone: string;
  queriedAt: string;
  /** Which service answered, since the two do not mean the same thing by a
   * match and an asset should be able to say where its point came from. */
  provider: "agrc" | "census";
  /** How many other candidate cities also produced a match. */
  alsoMatchedIn?: number;
  /** How far apart those matches were, in feet. Salt Lake's grid runs across
   * city lines, so this is usually zero — the same point under several city
   * names — and a large figure is the one to distrust. */
  spreadFt?: number;
};

export type Provider = "agrc" | "census";

export type GeocodeCache = Record<string, GeocodeMatch | { missed: true; triedAt: string }>;

export function loadCache(): GeocodeCache {
  const path = join(SEED_DATA_DIR, CACHE_FILE);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as GeocodeCache;
}

export function saveCache(cache: GeocodeCache) {
  writeFileSync(join(SEED_DATA_DIR, CACHE_FILE), `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

/**
 * The street part a geocoder can use, and the note the source carried.
 *
 * The abbreviations are the District's own — "6924 Old Bing. Hwy" is a real
 * row — and a geocoder has no idea what Bing. is.
 */
export function cleanAddress(raw: string): { street: string; note: string | null } {
  const note = raw.match(/\(([^)]+)\)/)?.[1] ?? null;
  const street = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bBing\./gi, "Bingham")
    .replace(/\bHwy\b\.?/gi, "Highway")
    .replace(/\bRd\b\.?/gi, "Road")
    .replace(/\bDr\b\.?/gi, "Drive")
    .replace(/\bLn\b\.?/gi, "Lane")
    .replace(/\bCir\b\.?/gi, "Circle")
    .replace(/\bBlvd\b\.?/gi, "Boulevard")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,]$/, "");
  return { street, note };
}

type AgrcResponse = {
  status: number;
  result?: {
    location: { x: number; y: number };
    score: number;
    matchAddress: string;
  };
};

/**
 * One address against one city. Returns null for anything that is not a
 * confident match — a low score here is not a near miss, it is the geocoder
 * saying it found a different street.
 */
async function geocodeIn(street: string, zone: string, apiKey: string, minScore: number): Promise<GeocodeMatch | null> {
  const url = `${ENDPOINT}/${encodeURIComponent(street)}/${encodeURIComponent(zone)}?apiKey=${encodeURIComponent(
    apiKey
  )}&spatialReference=4326&acceptScore=${minScore}`;

  const response = await fetch(url);
  if (response.status === 404) return null; // no match in this city
  if (!response.ok) throw new Error(`AGRC returned ${response.status} for "${street}, ${zone}"`);

  const body = (await response.json()) as AgrcResponse;
  const result = body.result;
  if (!result || result.score < minScore) return null;

  return {
    // AGRC returns x as longitude and y as latitude in 4326.
    lat: result.location.y,
    lng: result.location.x,
    score: result.score,
    matchAddress: result.matchAddress,
    zone,
    queriedAt: new Date().toISOString(),
    provider: "agrc",
  };
}

type CensusResponse = {
  result?: {
    addressMatches?: Array<{
      matchedAddress: string;
      coordinates: { x: number; y: number };
      addressComponents?: { fromAddress?: string; toAddress?: string; city?: string };
    }>;
  };
};

/**
 * The US Census Bureau's geocoder: public, keyless, and nobody's second choice
 * for Salt Lake grid addresses — but it needs no account, which is why it is
 * here.
 *
 * It publishes no confidence figure, so one is inferred: a match whose house
 * number range contains the number asked for scores 100, and anything else 80.
 * That distinction matters on a grid address, where "4500 S 4800 W" exists in
 * several cities and the geocoder will happily answer for whichever it was
 * asked about.
 */
async function geocodeCensusIn(street: string, zone: string): Promise<GeocodeMatch | null> {
  const address = `${street}, ${zone}, UT`;
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(
    address
  )}&benchmark=Public_AR_Current&format=json`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Census geocoder returned ${response.status} for "${address}"`);
  const body = (await response.json()) as CensusResponse;
  const match = body.result?.addressMatches?.[0];
  if (!match) return null;

  const wanted = Number(street.match(/^\d+/)?.[0] ?? NaN);
  const from = Number(match.addressComponents?.fromAddress ?? NaN);
  const to = Number(match.addressComponents?.toAddress ?? NaN);
  const inRange =
    Number.isFinite(wanted) && Number.isFinite(from) && Number.isFinite(to)
      ? wanted >= Math.min(from, to) && wanted <= Math.max(from, to)
      : false;

  return {
    lat: match.coordinates.y,
    lng: match.coordinates.x,
    score: inRange ? 100 : 80,
    matchAddress: match.matchedAddress,
    zone: match.addressComponents?.city ?? zone,
    queriedAt: new Date().toISOString(),
    provider: "census",
  };
}

/**
 * An address against every candidate city, keeping the best match.
 *
 * Stops early on a very strong match, because trying eleven more cities to
 * improve a 100 is only spending someone else's server.
 */
export async function geocodeAddress(
  raw: string,
  options: { provider: Provider; apiKey?: string; minScore?: number; zones?: string[]; delayMs?: number }
): Promise<GeocodeMatch | null> {
  const { street } = cleanAddress(raw);
  if (!street) return null;
  const minScore = options.minScore ?? 70;
  const zones = options.zones ?? CANDIDATE_ZONES;

  let best: GeocodeMatch | null = null;
  const found: GeocodeMatch[] = [];
  for (const zone of zones) {
    const match =
      options.provider === "agrc"
        ? await geocodeIn(street, zone, options.apiKey!, minScore)
        : await geocodeCensusIn(street, zone);
    if (match) {
      found.push(match);
      if (!best || match.score > best.score) best = match;
    }
    // AGRC scores its own answers, so a near-perfect one ends the search. The
    // Census geocoder does not, and its answers only mean something next to
    // each other — a grid address that matches in four cities is four possible
    // places, and stopping at the first would hide that.
    if (options.provider === "agrc" && best && best.score >= 95) break;
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
  }

  // A last try with no city at all, for the addresses whose city is not on the
  // list — several of the District's facilities sit outside its members.
  if (!best && options.provider === "census") {
    const anywhere = await geocodeCensusIn(street, "UT").catch(() => null);
    if (anywhere) return { ...anywhere, zone: anywhere.zone, alsoMatchedIn: 0, spreadFt: 0 };
  }
  if (!best) return null;

  // Salt Lake's street grid runs across city boundaries, so the same address
  // matched in three cities is usually three names for one place. Measuring
  // that is the difference between "ambiguous" and "labelled differently".
  const spreadFt = Math.round(
    Math.max(
      0,
      ...found.flatMap((a) =>
        found.map((b) => Math.hypot((a.lat - b.lat) * 364000, (a.lng - b.lng) * 288000))
      )
    )
  );

  return { ...best, alsoMatchedIn: Math.max(0, found.length - 1), spreadFt };
}

/** Every address, cached, with a report of what matched and what did not. */
export async function geocodeAll(
  addresses: string[],
  options: {
    provider: Provider;
    apiKey?: string;
    minScore?: number;
    delayMs?: number;
    onProgress?: (done: number, total: number) => void;
  }
) {
  const cache = loadCache();
  const unique = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  let queried = 0;

  for (const [index, address] of unique.entries()) {
    // A match is kept for good; a miss is tried again, because the reason for
    // a miss is usually this file — a city missing from the list, an
    // abbreviation nothing expanded — and that is what gets fixed between runs.
    const known = cache[address];
    if (!known || "missed" in known) {
      const match = await geocodeAddress(address, options);
      cache[address] = match ?? { missed: true, triedAt: new Date().toISOString() };
      queried++;
      saveCache(cache);
    }
    options.onProgress?.(index + 1, unique.length);
  }

  const matched = unique.filter((a) => cache[a] && !("missed" in cache[a]!));
  return {
    cache,
    total: unique.length,
    matched: matched.length,
    missed: unique.length - matched.length,
    queried,
    misses: unique.filter((a) => cache[a] && "missed" in cache[a]!),
  };
}
