import type { PrismaClient } from "@prisma/client";
import { recordComponentScores } from "../src/server/components";
import { ensureRollupStrategies } from "../src/server/rollup";
import { editAttributes } from "../src/domain/components/attributes";
import {
  COMPONENT_TYPES,
  COMPOSITION,
  DEFAULT_OBSERVED_AT,
  planComponentHistory,
  planSiteVisits,
  plannedReadings,
  plannedSiteRating,
  type PlannedReading,
} from "./component-plan";
import { ensureComponentInspectionTemplate } from "../src/server/component-inspections";
import { CONDITION_READING } from "../src/domain/components/inspection";

/**
 * Adds the sample components to the sample facilities, with what inspections
 * have found on them. The plan itself — which parts, what condition — is in
 * component-plan.ts, shared with the SQL generator.
 *
 * Additive and idempotent, like the facilities themselves: types and their
 * links are upserted, and an asset that already has components is left
 * exactly as it is — including every observation recorded against it since.
 */

export async function seedSampleComponents(prisma: PrismaClient, organizationId: string) {
  await ensureRollupStrategies(organizationId);

  const typeIds = new Map<string, string>();
  for (const spec of COMPONENT_TYPES) {
    // Numbered in the order written here: jsonb doesn't keep key order.
    const attributeSchema = editAttributes(spec.attributeSchema, {}) as object;
    const row = await prisma.componentType.upsert({
      where: { organizationId_code: { organizationId, code: spec.code } },
      update: { name: spec.name, description: spec.description, attributeSchema },
      create: { organizationId, ...spec, attributeSchema },
      select: { id: true },
    });
    typeIds.set(spec.code, row.id);
  }

  let links = 0;
  let componentsCreated = 0;
  let observations = 0;
  let assetsSkipped = 0;

  for (const [assetTypeCode, parts] of Object.entries(COMPOSITION)) {
    const assetType = await prisma.assetType.findFirst({ where: { code: assetTypeCode, organizationId } });
    if (!assetType) continue;

    for (const [i, part] of parts.entries()) {
      await prisma.assetTypeComponentType.upsert({
        where: { assetTypeId_componentTypeId: { assetTypeId: assetType.id, componentTypeId: typeIds.get(part.code)! } },
        update: { defaultCostWeight: part.weight, consequence: part.consequence, sortOrder: i },
        create: {
          assetTypeId: assetType.id,
          componentTypeId: typeIds.get(part.code)!,
          defaultCostWeight: part.weight,
          consequence: part.consequence,
          sortOrder: i,
        },
      });
      links++;
    }

    const assets = await prisma.asset.findMany({
      where: { organizationId, assetTypeId: assetType.id, deletedAt: null },
      include: { components: { select: { id: true } } },
      orderBy: { assetCode: "asc" },
    });

    for (const asset of assets) {
      if (asset.components.length > 0) {
        assetsSkipped++;
        continue;
      }
      const installYear = asset.installationDate?.getUTCFullYear() ?? 1990;
      // Observed where the facility was last inspected, if it says; otherwise
      // the most recent survey season.
      const lastInspected = await prisma.assetAttributeValue.findFirst({
        where: { assetId: asset.id, definition: { code: "LAST_INSPECTED" } },
        select: { dateValue: true },
      });
      const observedAt = lastInspected?.dateValue ?? DEFAULT_OBSERVED_AT;

      for (const part of parts) {
        const component = await prisma.assetComponent.create({
          data: { assetId: asset.id, componentTypeId: typeIds.get(part.code)! },
          select: { id: true },
        });
        componentsCreated++;

        for (const observation of planComponentHistory(asset.assetCode, installYear, observedAt, part)) {
          await recordComponentScores(organizationId, component.id, observation);
          observations++;
        }
      }
    }
  }

  return { componentTypes: COMPONENT_TYPES.length, links, componentsCreated, observations, assetsSkipped };
}

/** An answer in the column its field's type keeps it in. */
function resultValue(dataType: string, value: PlannedReading) {
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && dataType === "NUMBER") return { numberValue: value };
  return { textValue: String(value) };
}

/**
 * The site visits behind the sample facilities' component history: each
 * facility's site form, and a finding with readings for every component it
 * has, on the dates the history was recorded and on earlier visits before it.
 *
 * A finding on a date the history already holds is attached to that
 * condition reading rather than adding another, so the scores — and every
 * roll-up — are exactly what they were. Additive and idempotent: a facility
 * with any inspection already recorded is left alone.
 */
export async function seedSampleInspections(prisma: PrismaClient, organizationId: string) {
  const inspector =
    (await prisma.user.findFirst({
      where: { organizationId, isActive: true, role: { code: "INSPECTOR" } },
      orderBy: { email: "asc" },
    })) ?? (await prisma.user.findFirst({ where: { organizationId, isActive: true }, orderBy: { email: "asc" } }));
  if (!inspector) throw new Error("No user to record the sample inspections against");

  let visits = 0;
  let findings = 0;
  let skipped = 0;

  for (const [assetTypeCode, parts] of Object.entries(COMPOSITION)) {
    const assetType = await prisma.assetType.findFirst({ where: { code: assetTypeCode, organizationId } });
    if (!assetType) continue;
    const siteForm = await prisma.inspectionTemplate.findFirst({
      where: { assetTypeId: assetType.id, componentTypeId: null, isActive: true },
      include: { fields: true },
      orderBy: { createdAt: "asc" },
    });
    if (!siteForm) continue;

    const assets = await prisma.asset.findMany({
      where: { organizationId, assetTypeId: assetType.id, deletedAt: null },
      include: {
        components: { include: { componentType: true }, orderBy: { createdAt: "asc" } },
        _count: { select: { inspections: true } },
      },
      orderBy: { assetCode: "asc" },
    });

    for (const asset of assets) {
      if (asset._count.inspections > 0 || asset.components.length === 0) {
        skipped++;
        continue;
      }
      const lastInspected = await prisma.assetAttributeValue.findFirst({
        where: { assetId: asset.id, definition: { code: "LAST_INSPECTED" } },
        select: { dateValue: true },
      });
      const observedAt = lastInspected?.dateValue ?? DEFAULT_OBSERVED_AT;
      const installYear = asset.installationDate?.getUTCFullYear() ?? 1990;

      for (const visit of planSiteVisits(asset.assetCode, installYear, observedAt, parts)) {
        const seen = asset.components.filter((c) => visit.parts[c.componentType.code]);
        const average = seen.reduce((sum, c) => sum + visit.parts[c.componentType.code].condition, 0) / (seen.length || 1);
        const stamp = visit.date.toISOString().slice(0, 10);

        const parent = await prisma.inspection.create({
          data: {
            assetId: asset.id,
            templateId: siteForm.id,
            inspectorId: inspector.id,
            inspectionDate: visit.date,
            inspectionType: "Condition Assessment",
            notes: "Sample inspection.",
            results: {
              create: siteForm.fields
                .filter((f) => f.dataType === "NUMBER")
                .map((f) => ({
                  fieldId: f.id,
                  numberValue: plannedSiteRating(average, `${asset.assetCode}:${stamp}:${f.code}`),
                })),
            },
          },
        });
        visits++;

        for (const component of seen) {
          const plan = visit.parts[component.componentType.code];
          const form = await ensureComponentInspectionTemplate(assetType.id, component.componentType);
          const fieldOf = new Map(form.fields.map((f) => [f.code, f]));
          const label = component.label ?? component.componentType.name;
          const readings: Record<string, PlannedReading> = {
            [CONDITION_READING.code]: plan.condition / 10,
            ...plannedReadings(component.componentType.code, plan.condition, `${asset.assetCode}:${label}:${stamp}`),
          };
          const link = await prisma.assetTypeComponentType.findUnique({
            where: { assetTypeId_componentTypeId: { assetTypeId: assetType.id, componentTypeId: component.componentTypeId } },
          });

          const child = await prisma.inspection.create({
            data: {
              assetId: asset.id,
              assetComponentId: component.id,
              parentInspectionId: parent.id,
              templateId: form.id,
              inspectorId: inspector.id,
              inspectionDate: visit.date,
              inspectionType: parent.inspectionType,
              results: {
                create: Object.entries(readings)
                  .filter(([code]) => fieldOf.has(code))
                  .map(([code, value]) => ({ fieldId: fieldOf.get(code)!.id, ...resultValue(fieldOf.get(code)!.dataType, value) })),
              },
            },
          });
          findings++;

          // The history's own reading for this date, if it has one, becomes
          // this finding's; otherwise the finding adds an earlier reading.
          const existing = await prisma.conditionMeasurement.updateMany({
            where: { assetComponentId: component.id, measurementDate: visit.date, inspectionId: null },
            data: { inspectionId: child.id },
          });
          if (existing.count === 0) {
            await recordComponentScores(organizationId, component.id, {
              observedAt: visit.date,
              conditionScore: plan.condition,
              probability: plan.probability,
              consequence: link?.consequence ?? plan.consequence,
              inspectionId: child.id,
            });
          }
        }
      }
    }
  }

  return { visits, findings, facilitiesSkipped: skipped };
}
