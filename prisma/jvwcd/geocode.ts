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
];

export type GeocodeMatch = {
  lat: number;
  lng: number;
  /** AGRC's confidence, 0-100. */
  score: number;
  /** What it matched, which is not always what was asked for. */
  matchAddress: string;
  zone: string;
  queriedAt: string;
};

export type GeocodeCache = Record<string, GeocodeMatch | { missed: true; triedAt: string }>;

export function loadCache(): GeocodeCache {
  const path = join(SEED_DATA_DIR, CACHE_FILE);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as GeocodeCache;
}

export function saveCache(cache: GeocodeCache) {
  writeFileSync(join(SEED_DATA_DIR, CACHE_FILE), `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

/** The street part a geocoder can use, and the note the source carried. */
export function cleanAddress(raw: string): { street: string; note: string | null } {
  const note = raw.match(/\(([^)]+)\)/)?.[1] ?? null;
  const street = raw
    .replace(/\([^)]*\)/g, " ")
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
  options: { apiKey: string; minScore?: number; zones?: string[]; delayMs?: number }
): Promise<GeocodeMatch | null> {
  const { street } = cleanAddress(raw);
  if (!street) return null;
  const minScore = options.minScore ?? 70;
  const zones = options.zones ?? CANDIDATE_ZONES;

  let best: GeocodeMatch | null = null;
  for (const zone of zones) {
    const match = await geocodeIn(street, zone, options.apiKey, minScore);
    if (match && (!best || match.score > best.score)) best = match;
    if (best && best.score >= 95) break;
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
  }
  return best;
}

/** Every address, cached, with a report of what matched and what did not. */
export async function geocodeAll(
  addresses: string[],
  options: { apiKey: string; minScore?: number; delayMs?: number; onProgress?: (done: number, total: number) => void }
) {
  const cache = loadCache();
  const unique = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  let queried = 0;

  for (const [index, address] of unique.entries()) {
    if (!cache[address]) {
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
