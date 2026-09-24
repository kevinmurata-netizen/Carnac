# The JVWCD demo branch

This branch (`jvwcd-demo`) replaces CARNAC's synthetic sample network with **real published data from the Jordan Valley Water Conservancy District**. The schema is unchanged: same Prisma models, same migrations, same application. Only the data and the asset types differ.

**Source:** JVWCD *FY2025 Summary of Operations*, a public document. Nothing here is operational data, and nothing here came from the District privately.

The generic demo still exists on `main`, seeded from `prisma/seed.ts` with the invented "Meridian Falls Water Utility" network. The two are meant to be switched between, not merged.

---

## What is real, and what is not

This matters more than anything else in this document. The demo is only useful if nobody mistakes an illustration for a survey.

| | Source | Status |
|---|---|---|
| Pipe lengths, diameters, valve counts | FY2025 Summary of Operations | **Real**, to the foot |
| Reservoir capacity, material, build year, inspection year, elevations | FY2025 Summary of Operations | **Real** |
| Well capacity, setting level, production, power cost | FY2025 Summary of Operations | **Real** |
| Pump station zone, capacity, horsepower, lift, volume, cost | FY2025 Summary of Operations | **Real** |
| Facility street addresses | FY2025 Summary of Operations | **Real** (public addresses) |
| Facility coordinates | Geocoded from those addresses | **Derived** — see below |
| **Pipe geometry** | Drawn by the importer | **Illustrative only** |
| Pipe material and install year | — | **Absent**; the source does not publish them |
| Condition measurements | — | **None**; no asset here has been inspected in this system |
| Reservoir condition and risk scores | Modelled from age, material and inspection year | **Modelled**, by a demonstration model |
| Treatment costs, rules, weightings | CARNAC's sample library | **Invented**; carried over from the sample seed |

### Pipe geometry is illustrative

JVWCD's pipe inventory is published **by diameter band**, not by segment: one row saying 8-inch, 303,335 LF, 1,246 valves. There are no alignments in it and no addresses.

So every pipe line on the map is drawn by `prisma/jvwcd/import-locations.ts` at the correct *length* but in an arbitrary position and direction inside the service area. **No pipe on this map follows a real main.** Each one carries a `LOCATION_BASIS` attribute saying so.

### Facility coordinates are geocoded, not surveyed

The District's facility coordinates are GRAMA-protected and are not in the source. The street addresses are public, and are geocoded at seed time:

- **60 of 72** facilities matched and hold a real point.
- **12** did not match and are scattered inside the service area, marked "Not geolocated" in their `LOCATION_BASIS`.
- Every geocoded asset records which service matched it, to what address, and whether the same address matched in other cities. Salt Lake's street grid crosses city lines, so those multi-city matches resolve to the same point — measured, not assumed.

Answers are cached in `prisma/seed-data/jvwcd/geocode-cache.json` so re-seeding costs no requests and the matches can be read or corrected by hand.

---

## Running it

```bash
npm run db:up                 # Postgres + PostGIS in Docker
npm run db:deploy             # migrations
npm run db:reset -- --yes     # empty the assets and everything derived from them
npm run db:seed:jvwcd         # import the District's data
npm run qa:jvwcd              # verify counts and spot-check against the CSVs
```

`db:reset` keeps the organization, users, asset types, models, treatment library and settings, and removes every asset, its attributes, locations, inspections, condition, failures, risk and criticality, plus the work plans and scenarios built on them. It refuses to do anything without `--yes`.

**The sample seed is not wired to anything automatic on this branch.** `prisma/seed.ts` is kept as the reference for row shapes and still runs on demand with `npm run db:seed`, but the `prisma.seed` hook in `package.json` is disabled so that `prisma migrate reset` cannot refill this database with Meridian Falls data by itself.

### Geocoding

By default the seed uses the **US Census Bureau** geocoder, which needs no account. Utah's own geocoder is better on Salt Lake grid addresses; to use it, put a key in `.env`:

```
AGRC_API_KEY=your-key-here
```

It must be an ordinary **browser key** (referrer pattern `localhost`) or **server key** (your IP) from developer.mapserv.utah.gov. A key created for the *UGRC API Client* desktop tool will not work from a script — it is bound to that application. `GEOCODER=census` forces the Census geocoder even when a key is present.

---

## The data

| Type | Count | Source file |
|---|---|---|
| Waterline (pipe bands) | 27 | `jvwcd_pipe_inventory.csv` |
| Reservoir | 31 | `jvwcd_reservoirs.csv` |
| Well | 28 | `jvwcd_wells.csv` |
| Booster pump station | 13 | `jvwcd_booster_pumps.csv` |
| Valve, fire hydrant, treatment plant | 0 | none yet — the types exist for when there is data |

Totals reconcile with the source: 1,868,350 LF of pipe (353.9 mi), 193.5 MG of storage, 17,275 hp of pumping.

### Pipes are waterlines, not a new type

The 27 bands are imported onto the existing `WATERLINE` asset type, which already carries diameter and length and has the treatment library, rules, deterioration curves and cost rates behind it. A parallel "Pipe" type would have been a second name for the same thing that no screen in the application reads.

Three attributes were added to that type for this data: `DIAMETER_BAND` (the published label, `<2`, `3-4`, `15-16`), `VALVE_COUNT`, `PCT_OF_SYSTEM`, and `SEGMENT_BASIS` saying whether a row is a published band or a synthesized share of one. `MATERIAL` stopped being required, because the source does not publish it and a guessed material would age a pipe confidently and wrongly.

### Splitting bands into segments

A band can be imported as one asset (the default, and what the source actually says) or cut into segments, by dropping a `pipe-segments.json` next to the CSVs — see `pipe-segments.example.json`. Segments can be a target length, a count, or named and sized by hand per band. Lengths always reconcile with the published total to the foot, and the split is deterministic.

Synthesized segments make the model's output look like a capital programme rather than 27 enormous pipes — at the cost that a segment is a share of a band and not a pipe anyone can point at. Every one says so.

### Reservoir scoring

Reservoirs are the one class with enough published data to rank: build years from 1956 to 2025 and inspection years from 2014 to 2025. `src/domain/facility/reservoir.ts` scores them on age against a service life by material, how long since the last interior inspection, and the storage lost if one goes out of service. 31 scored, ranging 4.2 to 14.0.

**That model is a demonstration, not the District's.** JVWCD publishes four fields and nothing about how it judges condition or consequence. The service lives and the five-year inspection interval are common practice and would be replaced by the District's own criteria before anyone made a decision with them. Modelled condition is stored as a `DeteriorationPrediction`, never as a `ConditionMeasurement`, because no tank here has been assessed.

---

## What the application does not yet do with this data

CARNAC's schema is asset-type agnostic; its screens are not. `WATERLINE` is hard-coded in about 235 places, so on this branch:

- **The inventory page** offers every asset type and renders facilities from their own attribute definitions — read-only, no filters or sorting.
- **The map** draws the illustrative pipe lines, and shows facilities as points where the page supplies them.
- **Risk, condition, treatment planning, scenarios and work plans are waterline-only.** Reservoir scores exist in the database and in `npm run qa:jvwcd`, but no screen shows them.
- The waterline planning chain works on the 27 bands, but with no condition data and no install year its risk scores separate the bands by size alone.

Generalising those screens is the next piece of work, and it is a large one: treatments, rules and cost rates would be needed per asset type before scenarios mean anything for a reservoir.
