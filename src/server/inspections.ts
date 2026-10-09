import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConditionBand, computeWCI , type ConditionBand } from "@/domain/waterline/condition";
import { indexWeightsOf } from "@/server/condition-model";
import { sameCalendarDay } from "@/lib/format";
import { refreshComponentSnapshot, wholeAssetConditionModel } from "@/server/components";
import {
  checkComponentFinding,
  getVisitComponents,
  recordComponentFinding,
  type ComponentFinding,
} from "@/server/component-inspections";

/**
 * The asset being inspected and the form for its kind.
 *
 * The form follows the asset rather than the other way round: a reservoir is
 * asked about its roof and its sanitary vents, a pipe about its joints and its
 * bore, and neither form means anything against the other's asset. Until this
 * existed the inspection screen loaded the waterline form whatever it was
 * handed, so recording an inspection on a reservoir would have filed pipe
 * questions against it.
 *
 * A type with no active form returns `template: null` rather than throwing —
 * the screen says so and offers to go and write one.
 */
export async function getInspectionSubject(organizationId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId, deletedAt: null },
    select: {
      id: true,
      assetCode: true,
      name: true,
      assetTypeId: true,
      assetType: { select: { code: true, name: true } },
    },
  });
  if (!asset) return null;

  const template = await prisma.inspectionTemplate.findFirst({
    // The whole-asset form. A component's form belongs to its part of the
    // visit, not to the visit itself.
    where: { assetTypeId: asset.assetTypeId, isActive: true, componentTypeId: null },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  // Whether a score can be derived from the answers, which is a property of
  // the type rather than of the form: a type with a form but no condition
  // model records observations without producing a condition index.
  // Never a component-scoped model: that one holds component scores, and
  // scoring a whole-asset form with it would file the result as a component's.
  const wholeAsset = await wholeAssetConditionModel(asset.assetTypeId);
  const conditionModel = wholeAsset ? { id: wholeAsset.id, name: wholeAsset.name } : null;

  return { asset, template, conditionModel };
}

export type InspectionFilters = {
  search?: string;
  /** Asset type code: inspections of reservoirs only, say. */
  assetType?: string;
  inspectionType?: string;
  requiresFollowUp?: boolean;
  assetId?: string;
  /** Restrict to inspections of these assets, e.g. the result of a saved
   * filter. Saved filters select assets, so on this grid they mean "the
   * inspections belonging to the segments that match". */
  assetIds?: string[];
  inspector?: string;
  after?: Date;
  before?: Date;
  /** Quality as a fraction, matching how qualityScore is stored. */
  minQuality?: number;
  sort?: string;
  dir?: "asc" | "desc";
};

/** Grid columns backed by a real column, so they sort in the query. The WCI
 * score is derived from measurements and condition bands, so it is not here —
 * the page sorts that one itself. */
const INSPECTION_SORTS: Record<string, (dir: "asc" | "desc") => Prisma.InspectionOrderByWithRelationInput> = {
  assetCode: (dir) => ({ asset: { assetCode: dir } }),
  inspectionDate: (dir) => ({ inspectionDate: dir }),
  inspectionType: (dir) => ({ inspectionType: dir }),
  inspector: (dir) => ({ inspector: { name: dir } }),
  qualityScore: (dir) => ({ qualityScore: dir }),
  requiresFollowUp: (dir) => ({ requiresFollowUp: dir }),
  assetType: (dir) => ({ asset: { assetType: { name: dir } } }),
};

const inspectionInclude = {
  // The type comes along so a page can call the asset what it is: an
  // inspection of a reservoir labelled "Segment" reads as the wrong record.
  asset: {
    select: { id: true, assetCode: true, organizationId: true, assetType: { select: { name: true } } },
  },
  inspector: { select: { id: true, name: true } },
  results: { include: { field: true } },
  conditionMeasurements: true,
} satisfies Prisma.InspectionInclude;

export type InspectionWithDetails = Prisma.InspectionGetPayload<{ include: typeof inspectionInclude }>;

export async function listInspections(organizationId: string, filters: InspectionFilters = {}) {
  const assetWhere: Prisma.AssetWhereInput = { organizationId, deletedAt: null };
  if (filters.assetType) assetWhere.assetType = { code: filters.assetType };
  if (filters.search) {
    assetWhere.assetCode = { contains: filters.search, mode: "insensitive" };
  }

  // One row per visit: a component's findings are shown within the visit
  // they were part of, not as visits of their own.
  const where: Prisma.InspectionWhereInput = { asset: assetWhere, assetComponentId: null };
  if (filters.assetId) where.assetId = filters.assetId;
  // An empty list means a saved filter matched nothing, which must show no
  // rows rather than being ignored as "no constraint".
  if (filters.assetIds) where.assetId = { in: filters.assetIds };
  if (filters.inspectionType) where.inspectionType = filters.inspectionType;
  if (filters.requiresFollowUp) where.requiresFollowUp = true;
  if (filters.inspector) where.inspector = { name: filters.inspector };
  if (filters.after || filters.before) {
    where.inspectionDate = {
      ...(filters.after ? { gte: filters.after } : {}),
      ...(filters.before ? { lte: filters.before } : {}),
    };
  }
  if (filters.minQuality != null) where.qualityScore = { gte: filters.minQuality };

  const dir = filters.dir === "desc" ? "desc" : "asc";
  const sort = filters.sort ? INSPECTION_SORTS[filters.sort] : undefined;

  return prisma.inspection.findMany({
    where,
    include: inspectionInclude,
    orderBy: sort ? sort(dir) : { inspectionDate: "desc" },
  });
}

/** Inspector names that appear on this organization's inspections, for the
 * grid's Inspector filter. */
export async function listInspectors(organizationId: string): Promise<string[]> {
  const rows = await prisma.inspection.findMany({
    where: { asset: { organizationId, deletedAt: null } },
    select: { inspector: { select: { name: true } } },
    distinct: ["inspectorId"],
    orderBy: { inspector: { name: "asc" } },
  });
  return rows.map((r) => r.inspector.name).filter((n): n is string => Boolean(n));
}

export async function getInspectionById(organizationId: string, id: string) {
  return prisma.inspection.findFirst({
    where: { id, asset: { organizationId, deletedAt: null } },
    include: inspectionInclude,
  });
}

export type CreateInspectionInput = {
  assetId: string;
  templateId: string;
  inspectorId: string;
  inspectionDate: Date;
  inspectionType: string;
  requiresFollowUp: boolean;
  notes?: string;
  gpsLat?: number;
  gpsLng?: number;
  fieldValues: Array<{ fieldId: string; code: string; dataType: string; value: string }>;
  /** What was found on each component looked at on this visit. A component
   * left out was not inspected this time. */
  components?: ComponentFinding[];
};

export async function createInspection(organizationId: string, input: CreateInspectionInput) {
  const asset = await prisma.asset.findFirst({ where: { id: input.assetId, organizationId, deletedAt: null } });
  if (!asset) throw new Error("Asset not found");

  // Every component's answers are checked before anything is written, so a
  // bad reading on one part doesn't leave the rest of the visit half-saved.
  const findings = input.components ?? [];
  const visitComponents = findings.length > 0 ? await getVisitComponents(organizationId, asset.id) : [];
  const checked = findings.map((finding) => {
    const component = visitComponents.find((c) => c.id === finding.componentId);
    if (!component) throw new Error("A component on the form is no longer part of this asset — reload and try again");
    return { component, finding, results: checkComponentFinding(component, finding) };
  });

  // The model for the asset's own type. It used to be the waterline's
  // whatever was being inspected, which would have scored a reservoir on pipe
  // weights and filed the result under the waterline index. A type with no
  // model records the answers and no score.
  const conditionModel = await wholeAssetConditionModel(asset.assetTypeId);

  const results = input.fieldValues.map((f) => {
    if (f.dataType === "NUMBER") {
      return { fieldId: f.fieldId, numberValue: Number(f.value) };
    }
    return { fieldId: f.fieldId, textValue: f.value };
  });

  const numericScores: Record<string, number> = {};
  for (const f of input.fieldValues) {
    if (f.dataType === "NUMBER" && f.value !== "") numericScores[f.code] = Number(f.value);
  }
  // Score against the currently configured index, not the seed constant, so a
  // reweighted index takes effect on the very next inspection. Only asked for
  // when there is a model to file the score against.
  const wci = conditionModel ? computeWCI(numericScores, indexWeightsOf(conditionModel)) : 0;

  const inspection = await prisma.inspection.create({
    data: {
      assetId: input.assetId,
      templateId: input.templateId,
      inspectorId: input.inspectorId,
      inspectionDate: input.inspectionDate,
      inspectionType: input.inspectionType,
      requiresFollowUp: input.requiresFollowUp,
      notes: input.notes || null,
      gpsLat: input.gpsLat,
      gpsLng: input.gpsLng,
      results: { create: results },
    },
  });

  if (conditionModel && Object.keys(numericScores).length > 0) {
    await prisma.conditionMeasurement.create({
      data: {
        assetId: input.assetId,
        conditionModelId: conditionModel.id,
        inspectionId: inspection.id,
        score: wci,
        measurementDate: input.inspectionDate,
        source: "Inspection",
      },
    });
  }

  for (const { component, finding, results } of checked) {
    await recordComponentFinding(organizationId, inspection, component, finding, results);
  }

  return inspection;
}

export type InspectionEdit = {
  inspectionDate?: Date;
  inspectionType?: string;
  requiresFollowUp?: boolean;
  notes?: string | null;
  /** Result id → raw string from the form. */
  results?: Record<string, string>;
};

/**
 * Saves edits made on an inspection's detail page.
 *
 * Editing a condition rating changes the WCI, and the WCI is what the
 * condition, risk and deterioration pages actually read — so the measurement
 * is recomputed here rather than left showing the score from the original
 * entry. An edit that does not change any rating leaves the measurement alone.
 */
export async function updateInspection(organizationId: string, id: string, edit: InspectionEdit) {
  const inspection = await prisma.inspection.findFirst({
    where: { id, asset: { organizationId, deletedAt: null } },
    include: {
      results: { include: { field: true } },
      conditionMeasurements: { include: { conditionModel: { select: { formula: true } } } },
    },
  });
  if (!inspection) throw new Error("That inspection no longer exists");

  // A date input carries no time of day, so re-submitting the same day would
  // otherwise truncate the recorded instant to midnight. Only an actual change
  // of day is written.
  const dateChanged =
    edit.inspectionDate !== undefined && !sameCalendarDay(edit.inspectionDate, inspection.inspectionDate);

  const data: Prisma.InspectionUpdateInput = {};
  if (dateChanged) data.inspectionDate = edit.inspectionDate;
  if (edit.inspectionType !== undefined) data.inspectionType = edit.inspectionType;
  if (edit.requiresFollowUp !== undefined) data.requiresFollowUp = edit.requiresFollowUp;
  if (edit.notes !== undefined) data.notes = edit.notes;

  const writes: Prisma.PrismaPromise<unknown>[] = [prisma.inspection.update({ where: { id }, data })];

  // Ratings after the edit, defaulting to what is already stored so a form
  // showing only some fields still scores against the whole set.
  const scores: Record<string, number> = {};
  let ratingsChanged = false;

  for (const result of inspection.results) {
    const raw = edit.results?.[result.id];

    if (result.field.dataType === "NUMBER") {
      const current = result.numberValue;
      if (raw !== undefined) {
        const trimmed = raw.trim();
        const next = trimmed === "" ? null : Number(trimmed);
        if (next !== null && !Number.isFinite(next)) {
          throw new Error(`"${raw}" is not a valid ${result.field.label}`);
        }
        const min = (result.field.config as { min?: number } | null)?.min;
        const max = (result.field.config as { max?: number } | null)?.max;
        if (next !== null && ((min != null && next < min) || (max != null && next > max))) {
          throw new Error(`${result.field.label} must be between ${min} and ${max}`);
        }
        if (next !== current) {
          ratingsChanged = true;
          writes.push(
            prisma.inspectionResult.update({ where: { id: result.id }, data: { numberValue: next } })
          );
        }
        if (next !== null) scores[result.field.code] = next;
        continue;
      }
      if (current != null) scores[result.field.code] = current;
      continue;
    }

    if (raw !== undefined && raw !== (result.textValue ?? "")) {
      writes.push(
        prisma.inspectionResult.update({ where: { id: result.id }, data: { textValue: raw || null } })
      );
    }
  }

  const measurement = inspection.conditionMeasurements[0];

  if (measurement && (ratingsChanged || dateChanged)) {
    // Rescored with the index the measurement is filed under: its asset type's.
    const wci = computeWCI(scores, indexWeightsOf(measurement.conditionModel));
    writes.push(
      prisma.conditionMeasurement.update({
        where: { id: measurement.id },
        data: {
          score: wci,
          ...(dateChanged && edit.inspectionDate ? { measurementDate: edit.inspectionDate } : {}),
        },
      })
    );
  }

  // A visit's component findings happened on the visit's day, so they move
  // with it: their records, the condition each filed, and the risk scored
  // alongside — or the history would show the parts inspected on a day the
  // site wasn't.
  const parts = dateChanged
    ? await prisma.inspection.findMany({
        where: { parentInspectionId: id },
        select: { id: true, assetComponentId: true },
      })
    : [];
  if (parts.length > 0 && edit.inspectionDate) {
    const componentIds = parts.map((p) => p.assetComponentId!).filter(Boolean);
    writes.push(
      prisma.inspection.updateMany({ where: { parentInspectionId: id }, data: { inspectionDate: edit.inspectionDate } }),
      prisma.conditionMeasurement.updateMany({
        where: { inspectionId: { in: parts.map((p) => p.id) } },
        data: { measurementDate: edit.inspectionDate },
      }),
      prisma.riskAssessment.updateMany({
        where: { assetComponentId: { in: componentIds }, assessmentDate: inspection.inspectionDate },
        data: { assessmentDate: edit.inspectionDate },
      })
    );
  }

  await prisma.$transaction(writes);

  for (const part of parts) {
    if (part.assetComponentId) await refreshComponentSnapshot(part.assetComponentId);
  }
}

/** Stays synchronous so it can be used inside a .map() over rows; the caller
 * loads the configured bands once and passes them in. */
export function summarizeInspectionScore(inspection: InspectionWithDetails, bands: ConditionBand[]) {
  const measurement = inspection.conditionMeasurements[0];
  if (!measurement) return null;
  return { score: measurement.score, band: getConditionBand(measurement.score, bands) };
}
