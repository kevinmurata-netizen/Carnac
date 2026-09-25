import { AssetStatus, Prisma, type PrismaClient } from "@prisma/client";
import { FACILITY_ASSET_TYPES, type FacilityAttributeSpec } from "../src/domain/facility/attributes";
import { insertAssetPointLocation } from "../src/server/geo";

/**
 * Meridian Falls' storage, supply and pumping facilities.
 *
 * The sample network was 260 pipes and nothing else, which made every screen
 * built around more than one kind of asset — the inventory's type tabs, the
 * map's facility layer, the network page's type filter — impossible to see.
 * These seven reservoirs, six wells and five pump stations are the rest of a
 * small utility: somewhere for the water to be, somewhere it comes from, and
 * something to push it uphill.
 *
 * Everything here is invented, like the pipes. What is *not* invented is the
 * arithmetic: the elevations agree with the pressure zones, the lifts agree
 * with the elevations, and every power figure is computed from the head the
 * asset works against rather than typed in. A demo whose numbers contradict
 * each other teaches people to stop reading them.
 *
 * Adding this to an organization is additive and idempotent — see
 * `seedSampleFacilities` — so it can be run against a database that already
 * holds work, not only against a fresh seed.
 */

// ---------------------------------------------------------------------------
// The physical system these facilities sit in
// ---------------------------------------------------------------------------

/**
 * Meridian Falls climbs about 170 ft from the river to the east bench, and the
 * three pressure zones are that climb divided into thirds. A zone's overflow
 * elevation is what everything else is measured against: a reservoir serving
 * the zone floats on it, and a pump station feeding the zone lifts to it.
 */
const ZONE_OVERFLOW_FT: Record<string, number> = {
  "Zone A - Low": 1372,
  "Zone B - Mid": 1456,
  "Zone C - High": 1544,
};

/** What a well's pump adds above ground level to get its water into the mains:
 * friction, plus the service pressure customers expect at the tap. */
const DISTRIBUTION_HEAD_FT = 120;

/**
 * One acre-foot lifted one foot is 1.024 kWh of work. Pumps and motors return
 * about 70% of what they are fed, and the utility buys power at $0.11, so the
 * cost of moving an acre-foot is that rate against the head it moves through.
 * Every power cost and cost-per-acre-foot below comes out of this, which is why
 * the deepest well is also the dearest one to run.
 */
const KWH_PER_ACRE_FOOT_FOOT = 1.024;
const WIRE_TO_WATER_EFFICIENCY = 0.7;
const POWER_PRICE_PER_KWH = 0.11;

function powerCost(acreFeet: number, headFt: number): { total: number; perAcreFoot: number } {
  const perAcreFoot = ((KWH_PER_ACRE_FOOT_FOOT * headFt) / WIRE_TO_WATER_EFFICIENCY) * POWER_PRICE_PER_KWH;
  return {
    // A power bill is a year of meter readings, not a computed figure, so it is
    // rounded to something a bill would plausibly say.
    total: Math.round((perAcreFoot * acreFeet) / 100) * 100,
    perAcreFoot: Math.round(perAcreFoot),
  };
}

/**
 * Installed horsepower for a station moving this much water against this lift:
 * the hydraulic formula (gpm × ft ÷ 3,960) at the same efficiency, rounded up
 * to the next 25 hp anyone actually sells.
 */
function installedHp(capacityCfs: number, liftFt: number): number {
  const gpm = capacityCfs * 448.831;
  return Math.ceil((gpm * liftFt) / (3960 * WIRE_TO_WATER_EFFICIENCY) / 25) * 25;
}

/** 1 January of the published year — utilities publish a year for an interior
 * inspection, and the attribute's own help text says so. */
function yearAsDate(year: number): Date {
  return new Date(Date.UTC(year, 0, 1));
}

// ---------------------------------------------------------------------------
// The facilities
// ---------------------------------------------------------------------------

type AttributeWrite = { code: string; text?: string; number?: number; date?: Date };

type SampleFacility = {
  typeCode: string;
  assetCode: string;
  name: string;
  address: string;
  serviceArea: string;
  pressureZone: string;
  lat: number;
  lng: number;
  installYear: number;
  expectedUsefulLife: number;
  ownerDepartment: string;
  attributes: AttributeWrite[];
};

/** Positions sit inside the service area whose pipes they feed, spread far
 * enough apart to be distinguishable at the zoom the network map opens at. */
type Placement = { serviceArea: string; pressureZone: string; lat: number; lng: number; address: string };

function reservoir(
  assetCode: string,
  name: string,
  place: Placement,
  spec: {
    capacityMg: number;
    material: string;
    installYear: number;
    lastInspected: number;
    /** Depth of water the tank holds, floor to overflow. The overflow itself is
     * the zone's, so the floor follows from it. */
    depthFt: number;
  }
): SampleFacility {
  const overflow = ZONE_OVERFLOW_FT[place.pressureZone];
  return {
    typeCode: "RESERVOIR",
    assetCode,
    name,
    address: place.address,
    serviceArea: place.serviceArea,
    pressureZone: place.pressureZone,
    lat: place.lat,
    lng: place.lng,
    installYear: spec.installYear,
    // Steel tanks are recoated rather than replaced, but they do not last what
    // a concrete reservoir lasts.
    expectedUsefulLife: spec.material === "Steel" ? 60 : 80,
    ownerDepartment: "Water Storage",
    attributes: [
      { code: "CAPACITY_MG", number: spec.capacityMg },
      { code: "MATERIAL", text: spec.material },
      { code: "LAST_INSPECTED", date: yearAsDate(spec.lastInspected) },
      { code: "FLOOR_ELEV_FT", number: overflow - spec.depthFt },
      { code: "OVERFLOW_ELEV_FT", number: overflow },
    ],
  };
}

function well(
  assetCode: string,
  name: string,
  place: Placement,
  spec: {
    designCapacityCfs: number;
    settingLevelFt: number;
    installYear: number;
    /** Three years of production, most recent last. */
    production: Record<number, number>;
  }
): SampleFacility {
  const years = Object.keys(spec.production)
    .map(Number)
    .sort((a, b) => a - b);
  const latest = spec.production[years[years.length - 1]];
  // A well's pump lifts from its setting, which is measured below the ground it
  // stands on, up to service pressure in the mains above it. The zone does not
  // enter into it: a bench well and a river well both start at their own
  // ground, and the climb between them is what the pump stations are for.
  const head = spec.settingLevelFt + DISTRIBUTION_HEAD_FT;
  const power = powerCost(latest, head);

  return {
    typeCode: "WELL",
    assetCode,
    name,
    address: place.address,
    serviceArea: place.serviceArea,
    pressureZone: place.pressureZone,
    lat: place.lat,
    lng: place.lng,
    installYear: spec.installYear,
    expectedUsefulLife: 50,
    ownerDepartment: "Water Supply",
    attributes: [
      { code: "DESIGN_CAPACITY_CFS", number: spec.designCapacityCfs },
      { code: "WELL_SETTING_LEVEL_FT", number: spec.settingLevelFt },
      { code: "ANNUAL_PRODUCTION_AF", number: latest },
      { code: "ANNUAL_PRODUCTION_HISTORY", text: JSON.stringify(spec.production) },
      { code: "TOTAL_POWER_COST", number: power.total },
      { code: "AVG_COST_PER_AF", number: power.perAcreFoot },
    ],
  };
}

function pumpStation(
  assetCode: string,
  name: string,
  place: Placement,
  spec: {
    /** The zone the station discharges into. Its lift is the climb from the
     * zone the station draws out of to that one. */
    servesZone: string;
    capacityCfs: number;
    volumePumpedAf: number;
    installYear: number;
  }
): SampleFacility {
  const liftFt = ZONE_OVERFLOW_FT[spec.servesZone] - ZONE_OVERFLOW_FT[place.pressureZone];
  // A station lifts out of the zone it stands in and into a higher one. If
  // those are the same zone there is no lift, and every figure derived from it
  // — horsepower, power cost, cost per acre-foot — would come out as nothing.
  if (liftFt <= 0) {
    throw new Error(`${assetCode} stands in ${place.pressureZone} and serves ${spec.servesZone}: no lift to pump against`);
  }
  const power = powerCost(spec.volumePumpedAf, liftFt);

  return {
    typeCode: "BOOSTER_PUMP_STATION",
    assetCode,
    name,
    address: place.address,
    serviceArea: place.serviceArea,
    pressureZone: place.pressureZone,
    lat: place.lat,
    lng: place.lng,
    installYear: spec.installYear,
    expectedUsefulLife: 40,
    ownerDepartment: "Pumping Operations",
    attributes: [
      { code: "ZONE", text: spec.servesZone },
      { code: "CAPACITY_CFS", number: spec.capacityCfs },
      { code: "TOTAL_HP", number: installedHp(spec.capacityCfs, liftFt) },
      { code: "AVG_DYNAMIC_LIFT_FT", number: liftFt },
      { code: "VOLUME_PUMPED_AF", number: spec.volumePumpedAf },
      { code: "TOTAL_POWER_COST", number: power.total },
      { code: "AVG_COST_PER_AF", number: power.perAcreFoot },
    ],
  };
}

// The six service areas the pipe network is laid out in, with a position in
// each for the facilities that serve it.
const RIVERSIDE = (lat: number, lng: number, address: string): Placement => ({
  serviceArea: "Riverside",
  pressureZone: "Zone A - Low",
  lat,
  lng,
  address,
});
const SOUTHPORT = (lat: number, lng: number, address: string): Placement => ({
  serviceArea: "Southport",
  pressureZone: "Zone A - Low",
  lat,
  lng,
  address,
});
const DOWNTOWN = (lat: number, lng: number, address: string): Placement => ({
  serviceArea: "Downtown",
  pressureZone: "Zone B - Mid",
  lat,
  lng,
  address,
});
const EASTGATE = (lat: number, lng: number, address: string): Placement => ({
  serviceArea: "Eastgate",
  pressureZone: "Zone B - Mid",
  lat,
  lng,
  address,
});
const HIGHLAND_PARK = (lat: number, lng: number, address: string): Placement => ({
  serviceArea: "Highland Park",
  pressureZone: "Zone C - High",
  lat,
  lng,
  address,
});
const MILLBROOK = (lat: number, lng: number, address: string): Placement => ({
  serviceArea: "Millbrook",
  pressureZone: "Zone C - High",
  lat,
  lng,
  address,
});

export const SAMPLE_FACILITIES: SampleFacility[] = [
  // Storage — one reservoir per service area, plus the pair the city grew with.
  reservoir("RSV-01", "Riverside Reservoir", RIVERSIDE(37.71642, -97.37988, "1420 River Bluff Road"), {
    capacityMg: 6,
    material: "Prestressed Concrete",
    installYear: 1972,
    lastInspected: 2022,
    depthFt: 32,
  }),
  reservoir("RSV-02", "Southport Tank", SOUTHPORT(37.65704, -97.28715, "905 Southport Avenue"), {
    capacityMg: 2,
    material: "Steel",
    installYear: 1988,
    lastInspected: 2019,
    depthFt: 34,
  }),
  reservoir("RSV-03", "Meridian Central Reservoir", DOWNTOWN(37.66948, -97.37846, "300 Waterworks Lane"), {
    capacityMg: 8,
    material: "Concrete",
    installYear: 1961,
    lastInspected: 2023,
    depthFt: 30,
  }),
  reservoir("RSV-04", "Eastgate Tank", EASTGATE(37.71508, -97.32644, "2200 Eastgate Boulevard"), {
    capacityMg: 3,
    material: "Steel",
    installYear: 1995,
    lastInspected: 2021,
    depthFt: 36,
  }),
  reservoir("RSV-05", "Highland Park Reservoir", HIGHLAND_PARK(37.66105, -97.32718, "1750 Summit Ridge Drive"), {
    capacityMg: 4,
    material: "Prestressed Concrete",
    installYear: 2004,
    lastInspected: 2024,
    depthFt: 32,
  }),
  reservoir("RSV-06", "Millbrook Tank", MILLBROOK(37.71702, -97.28846, "4100 Millbrook Heights Road"), {
    capacityMg: 1.5,
    material: "Steel",
    installYear: 1979,
    lastInspected: 2017,
    depthFt: 38,
  }),
  reservoir("RSV-07", "North Hill Standpipe", MILLBROOK(37.70486, -97.30122, "3615 North Hill Court"), {
    capacityMg: 0.75,
    material: "Concrete",
    installYear: 2013,
    lastInspected: 2024,
    depthFt: 44,
  }),

  // Supply — the wellfield along the river, and the deeper bench wells.
  well("WEL-01", "Riverside Well 1", RIVERSIDE(37.70632, -97.38284, "80 Cottonwood Flats Road"), {
    designCapacityCfs: 3.1,
    settingLevelFt: 240,
    installYear: 1968,
    production: { 2023: 902, 2024: 968, 2025: 874 },
  }),
  well("WEL-02", "Riverside Well 2", RIVERSIDE(37.71884, -97.36612, "145 Cottonwood Flats Road"), {
    designCapacityCfs: 2.4,
    settingLevelFt: 265,
    installYear: 1991,
    production: { 2023: 640, 2024: 612, 2025: 703 },
  }),
  well("WEL-03", "Southport Well", SOUTHPORT(37.67012, -97.29918, "612 Harbor Works Road"), {
    designCapacityCfs: 4.2,
    settingLevelFt: 310,
    installYear: 1977,
    production: { 2023: 1180, 2024: 1244, 2025: 1096 },
  }),
  well("WEL-04", "Eastgate Well", EASTGATE(37.70214, -97.34188, "1890 Orchard Street"), {
    designCapacityCfs: 1.9,
    settingLevelFt: 195,
    installYear: 2008,
    production: { 2023: 418, 2024: 455, 2025: 502 },
  }),
  well("WEL-05", "Millbrook Well", MILLBROOK(37.72004, -97.30284, "4320 Quarry Road"), {
    designCapacityCfs: 2.8,
    settingLevelFt: 402,
    installYear: 1985,
    production: { 2023: 735, 2024: 690, 2025: 648 },
  }),
  well("WEL-06", "Highland Park Well", HIGHLAND_PARK(37.67288, -97.34402, "1205 Bench Road"), {
    designCapacityCfs: 3.6,
    settingLevelFt: 355,
    installYear: 2015,
    production: { 2023: 1010, 2024: 1092, 2025: 1145 },
  }),

  // Pumping — each station lifts out of the zone it stands in and into the next
  // one up, which is where its lift comes from.
  pumpStation("BPS-01", "Riverside Booster Station", RIVERSIDE(37.70288, -97.36884, "55 Levee Road"), {
    servesZone: "Zone B - Mid",
    capacityCfs: 5,
    volumePumpedAf: 1820,
    installYear: 1974,
  }),
  pumpStation("BPS-02", "Southport Booster Station", SOUTHPORT(37.66884, -97.28112, "1040 Southport Avenue"), {
    servesZone: "Zone B - Mid",
    capacityCfs: 3.4,
    volumePumpedAf: 1150,
    installYear: 1999,
  }),
  pumpStation("BPS-03", "Downtown Booster Station", DOWNTOWN(37.66012, -97.36184, "820 Foundry Street"), {
    servesZone: "Zone C - High",
    capacityCfs: 4.2,
    volumePumpedAf: 1410,
    installYear: 1983,
  }),
  pumpStation("BPS-04", "Eastgate Booster Station", EASTGATE(37.70602, -97.32188, "2455 Eastgate Boulevard"), {
    servesZone: "Zone C - High",
    capacityCfs: 2.6,
    volumePumpedAf: 940,
    installYear: 2007,
  }),
  // The one station that skips a zone: it takes the wellfield's water straight
  // from the river flats to the bench, which is why its lift is twice the rest.
  pumpStation("BPS-05", "River Road High Service Station", RIVERSIDE(37.70914, -97.37712, "210 River Road"), {
    servesZone: "Zone C - High",
    capacityCfs: 2,
    volumePumpedAf: 610,
    installYear: 2016,
  }),
];

// ---------------------------------------------------------------------------
// Writing it
// ---------------------------------------------------------------------------

/** The `config` blob as the rest of the app reads it: `options` for an ENUM's
 * choices, `help` for the note beside the field. */
function configOf(attribute: FacilityAttributeSpec) {
  const config = {
    ...(attribute.options ? { options: attribute.options } : {}),
    ...(attribute.help ? { help: attribute.help } : {}),
  } satisfies Prisma.InputJsonObject;
  return Object.keys(config).length > 0 ? config : undefined;
}

/**
 * The facility types and their attribute definitions, leaving anything already
 * there alone. Types match on their code, attributes on (type, code), so this
 * can be run repeatedly without stacking up duplicates.
 */
export async function ensureFacilityTypes(prisma: PrismaClient, organizationId: string) {
  const byCode = new Map<string, { id: string; definitions: Map<string, string> }>();

  for (const spec of FACILITY_ASSET_TYPES) {
    const existing = await prisma.assetType.findUnique({ where: { code: spec.code }, select: { id: true } });
    const assetType = existing
      ? await prisma.assetType.update({
          where: { code: spec.code },
          data: { name: spec.name, description: spec.description },
          select: { id: true },
        })
      : await prisma.assetType.create({
          data: { code: spec.code, name: spec.name, description: spec.description, organizationId },
          select: { id: true },
        });

    const definitions = new Map<string, string>();
    let sortOrder = 0;
    for (const attribute of spec.attributes) {
      const definition = await prisma.assetAttributeDefinition.upsert({
        where: { assetTypeId_code: { assetTypeId: assetType.id, code: attribute.code } },
        update: {
          label: attribute.label,
          dataType: attribute.dataType,
          unit: attribute.unit ?? null,
          sortOrder,
          config: configOf(attribute),
        },
        create: {
          assetTypeId: assetType.id,
          code: attribute.code,
          label: attribute.label,
          dataType: attribute.dataType,
          unit: attribute.unit ?? null,
          isRequired: false,
          sortOrder,
          config: configOf(attribute),
        },
        select: { id: true, code: true },
      });
      definitions.set(definition.code, definition.id);
      sortOrder++;
    }

    byCode.set(spec.code, { id: assetType.id, definitions });
  }

  return byCode;
}

export type FacilitySeedSummary = {
  types: number;
  created: number;
  /** Already present, and left exactly as they were. */
  skipped: number;
};

/**
 * Add the sample facilities to an organization.
 *
 * Additive and idempotent, unlike `seed.ts`, which empties the database before
 * it writes: this creates only what is missing and never touches a facility
 * that is already there, so running it twice changes nothing and running it
 * against a database with real work in it adds facilities without disturbing
 * that work.
 */
export async function seedSampleFacilities(
  prisma: PrismaClient,
  organizationId: string
): Promise<FacilitySeedSummary> {
  const types = await ensureFacilityTypes(prisma, organizationId);
  let created = 0;
  let skipped = 0;

  for (const facility of SAMPLE_FACILITIES) {
    const type = types.get(facility.typeCode);
    if (!type) throw new Error(`No asset type ${facility.typeCode} — the catalog and the sample data disagree`);

    const existing = await prisma.asset.findUnique({
      where: { organizationId_assetCode: { organizationId, assetCode: facility.assetCode } },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const attributes: AttributeWrite[] = [
      { code: "FACILITY_ID", text: facility.assetCode },
      { code: "ADDRESS", text: facility.address },
      {
        code: "LOCATION_BASIS",
        text: `Sample data. Meridian Falls is an invented utility, so this position is invented too — placed inside ${facility.serviceArea}, the service area this facility works for, the same way the sample network's pipes are drawn.`,
      },
      ...facility.attributes,
    ];

    const asset = await prisma.asset.create({
      data: {
        organizationId,
        assetTypeId: type.id,
        assetCode: facility.assetCode,
        name: facility.name,
        status: AssetStatus.ACTIVE,
        ownerDepartment: facility.ownerDepartment,
        installationDate: new Date(Date.UTC(facility.installYear, 5, 15)),
        expectedUsefulLife: facility.expectedUsefulLife,
        attributeValues: {
          create: attributes.flatMap(({ code, text, number, date }) => {
            const definitionId = type.definitions.get(code);
            if (!definitionId) return [];
            return [{ definitionId, textValue: text, numberValue: number, dateValue: date }];
          }),
        },
      },
      select: { id: true },
    });

    await insertAssetPointLocation(
      asset.id,
      { lat: facility.lat, lng: facility.lng },
      { serviceArea: facility.serviceArea, pressureZone: facility.pressureZone }
    );
    created++;
  }

  return { types: types.size, created, skipped };
}
