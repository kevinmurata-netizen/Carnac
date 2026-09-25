import { AttributeDataType } from "@prisma/client";

/**
 * The facility asset types — reservoirs, wells and booster pump stations — and
 * the attributes each one is described by.
 *
 * SPEC §3 requires the core to be asset-type agnostic: `Asset`, `AssetType`
 * and an extensible attribute model, with no per-type tables. So holding a
 * reservoir is an insert, not a migration.
 *
 * The codes, labels and units here are the ones Jordan Valley Water
 * Conservancy District publishes its storage, supply and pumping tables in.
 * That is deliberate: a real inventory imported later lands on this same
 * catalog instead of a second vocabulary for the same things.
 *
 * Nothing here creates an asset. These are the definitions that values are
 * written against.
 */

export type FacilityAttributeSpec = {
  code: string;
  label: string;
  dataType: AttributeDataType;
  unit?: string;
  options?: string[];
  help?: string;
};

export type FacilityTypeSpec = {
  code: string;
  name: string;
  description: string;
  attributes: FacilityAttributeSpec[];
};

/**
 * Where an asset's point on the map came from. A map that cannot tell a
 * surveyed position from a geocoded address from an invented one is a map that
 * will eventually be believed.
 */
export const LOCATION_BASIS: FacilityAttributeSpec = {
  code: "LOCATION_BASIS",
  label: "Location Basis",
  dataType: AttributeDataType.TEXT,
  help: "How this asset came by its position: surveyed, geocoded from a published address, scattered inside the service area because the address did not match, or drawn illustratively. A basis that begins Scattered or Illustrative is not a real location, and the map draws it faded.",
};

/** Held by every facility, so a row can be traced back to its source. */
const FACILITY: FacilityAttributeSpec[] = [
  { code: "FACILITY_ID", label: "Facility ID", dataType: AttributeDataType.TEXT },
  { code: "ADDRESS", label: "Street Address", dataType: AttributeDataType.TEXT },
  LOCATION_BASIS,
];

export const FACILITY_ASSET_TYPES: FacilityTypeSpec[] = [
  {
    code: "RESERVOIR",
    name: "Reservoir",
    description: "Finished-water storage: tanks and reservoirs, by capacity, construction and elevation.",
    attributes: [
      ...FACILITY,
      { code: "CAPACITY_MG", label: "Capacity", dataType: AttributeDataType.NUMBER, unit: "MG" },
      {
        code: "MATERIAL",
        label: "Material",
        dataType: AttributeDataType.ENUM,
        options: ["Concrete", "Prestressed Concrete", "Steel", "Buried Concrete", "Other", "Unknown"],
      },
      {
        code: "LAST_INSPECTED",
        label: "Last Inspected",
        dataType: AttributeDataType.DATE,
        help: "Interior inspection — drained, or by diver or ROV. Utilities publish a year rather than a date, so this is accurate to the year.",
      },
      { code: "FLOOR_ELEV_FT", label: "Floor Elevation", dataType: AttributeDataType.NUMBER, unit: "ft" },
      { code: "OVERFLOW_ELEV_FT", label: "Overflow Elevation", dataType: AttributeDataType.NUMBER, unit: "ft" },
    ],
  },
  {
    code: "WELL",
    name: "Well",
    description:
      "Groundwater production wells, with design capacity, setting and what each one produced and cost to run.",
    attributes: [
      ...FACILITY,
      { code: "DESIGN_CAPACITY_CFS", label: "Design Capacity", dataType: AttributeDataType.NUMBER, unit: "cfs" },
      { code: "WELL_SETTING_LEVEL_FT", label: "Well Setting Level", dataType: AttributeDataType.NUMBER, unit: "ft" },
      {
        code: "ANNUAL_PRODUCTION_AF",
        label: "Annual Production",
        dataType: AttributeDataType.NUMBER,
        unit: "AF",
        help: "The most recent year. The year-by-year series is in Production History.",
      },
      {
        code: "ANNUAL_PRODUCTION_HISTORY",
        label: "Production History",
        dataType: AttributeDataType.TEXT,
        help: 'Year-by-year production as JSON, e.g. {"2023":812,"2024":905,"2025":774}. Text because the attribute model has no series type; the single number above is what anything sorting or ranking reads.',
      },
      { code: "TOTAL_POWER_COST", label: "Total Power Cost", dataType: AttributeDataType.NUMBER, unit: "$" },
      { code: "AVG_COST_PER_AF", label: "Average Cost per Acre-Foot", dataType: AttributeDataType.NUMBER, unit: "$/AF" },
    ],
  },
  {
    code: "BOOSTER_PUMP_STATION",
    name: "Booster Pump Station",
    description: "Pump stations that lift water between pressure zones, with capacity, lift and what pumping cost.",
    attributes: [
      ...FACILITY,
      {
        code: "ZONE",
        label: "Pressure Zone",
        dataType: AttributeDataType.TEXT,
        help: "The zone the station discharges into, which is the one it exists to serve.",
      },
      { code: "CAPACITY_CFS", label: "Capacity", dataType: AttributeDataType.NUMBER, unit: "cfs" },
      { code: "TOTAL_HP", label: "Total Horsepower", dataType: AttributeDataType.NUMBER, unit: "hp" },
      { code: "AVG_DYNAMIC_LIFT_FT", label: "Average Dynamic Lift", dataType: AttributeDataType.NUMBER, unit: "ft" },
      { code: "VOLUME_PUMPED_AF", label: "Volume Pumped", dataType: AttributeDataType.NUMBER, unit: "AF" },
      { code: "TOTAL_POWER_COST", label: "Total Power Cost", dataType: AttributeDataType.NUMBER, unit: "$" },
      { code: "AVG_COST_PER_AF", label: "Average Cost per Acre-Foot", dataType: AttributeDataType.NUMBER, unit: "$/AF" },
    ],
  },
];
