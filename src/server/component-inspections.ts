import type { AttributeDataType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CONDITION_READING,
  componentInspectionSpec,
  conditionFromRating,
  probabilityFromCondition,
} from "@/domain/components/inspection";
import { recordComponentScores } from "@/server/components";

/**
 * Component inspections: the part of a site visit that looks at each
 * component the asset has.
 *
 * A visit is one whole-asset Inspection; each component inspected on it is a
 * child Inspection with assetComponentId set and parentInspectionId pointing
 * at the visit, answering that component type's own form. The component's
 * condition and risk come from its rating and are filed with the child, so
 * the one history holds them.
 */

type FieldConfig = { helpText?: string; options?: string[]; min?: number; max?: number };

export type VisitField = {
  id: string;
  code: string;
  label: string;
  dataType: AttributeDataType;
  unit: string | null;
  isRequired: boolean;
  helpText: string | null;
  options: string[];
  min: number | null;
  max: number | null;
};

export type VisitComponent = {
  id: string;
  label: string;
  componentTypeName: string;
  templateId: string;
  templateName: string;
  fields: VisitField[];
  /** Consequence of failure for this part on this kind of asset; null means
   * the inspection records condition but can't produce a risk score. */
  consequence: number | null;
};

function toVisitField(f: {
  id: string;
  code: string;
  label: string;
  dataType: AttributeDataType;
  unit: string | null;
  isRequired: boolean;
  config: Prisma.JsonValue;
}): VisitField {
  const config = (f.config ?? {}) as FieldConfig;
  return {
    id: f.id,
    code: f.code,
    label: f.label,
    dataType: f.dataType,
    unit: f.unit,
    isRequired: f.isRequired,
    helpText: config.helpText ?? null,
    options: config.options ?? [],
    min: config.min ?? null,
    max: config.max ?? null,
  };
}

/**
 * The form for one kind of component on one kind of asset, created from its
 * definition the first time it is needed — like the component scoring models
 * — so a component type added under Settings is inspectable straight away.
 * Idempotent: readings added to a definition later are added to the form,
 * and nothing already on it is changed.
 */
export async function ensureComponentInspectionTemplate(
  assetTypeId: string,
  componentType: { id: string; code: string; name: string }
) {
  const spec = componentInspectionSpec(componentType.code, componentType.name);
  let template = await prisma.inspectionTemplate.findFirst({
    where: { assetTypeId, componentTypeId: componentType.id },
    include: { fields: true },
    orderBy: { createdAt: "asc" },
  });
  if (!template) {
    template = await prisma.inspectionTemplate.create({
      data: { assetTypeId, componentTypeId: componentType.id, name: spec.name, description: spec.description },
      include: { fields: true },
    });
  }

  const have = new Set(template.fields.map((f) => f.code));
  const missing = spec.readings.filter((r) => !have.has(r.code));
  if (missing.length > 0) {
    await prisma.inspectionTemplateField.createMany({
      data: missing.map((r) => ({
        templateId: template.id,
        code: r.code,
        label: r.label,
        dataType: r.dataType,
        unit: r.unit ?? null,
        isRequired: r.isRequired ?? false,
        sortOrder: spec.readings.indexOf(r),
        config: {
          ...(r.help ? { helpText: r.help } : {}),
          ...(r.options ? { options: r.options } : {}),
          ...(r.min != null ? { min: r.min } : {}),
          ...(r.max != null ? { max: r.max } : {}),
        },
      })),
      skipDuplicates: true,
    });
  }

  return prisma.inspectionTemplate.findUniqueOrThrow({
    where: { id: template.id },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
}

/** Each component of an asset, with the form it is inspected on. */
export async function getVisitComponents(organizationId: string, assetId: string): Promise<VisitComponent[]> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId, deletedAt: null },
    select: {
      assetTypeId: true,
      assetType: { select: { componentTypes: { select: { componentTypeId: true, sortOrder: true, consequence: true } } } },
      components: {
        orderBy: { createdAt: "asc" },
        include: { componentType: { select: { id: true, code: true, name: true } } },
      },
    },
  });
  if (!asset) return [];

  const linkOf = new Map(asset.assetType.componentTypes.map((l) => [l.componentTypeId, l]));
  const components = [...asset.components].sort(
    (a, b) => (linkOf.get(a.componentTypeId)?.sortOrder ?? 0) - (linkOf.get(b.componentTypeId)?.sortOrder ?? 0)
  );

  const templates = new Map<string, Awaited<ReturnType<typeof ensureComponentInspectionTemplate>>>();
  for (const c of components) {
    if (!templates.has(c.componentTypeId)) {
      templates.set(c.componentTypeId, await ensureComponentInspectionTemplate(asset.assetTypeId, c.componentType));
    }
  }

  return components.map((c) => {
    const template = templates.get(c.componentTypeId)!;
    return {
      id: c.id,
      label: c.label ?? c.componentType.name,
      componentTypeName: c.componentType.name,
      templateId: template.id,
      templateName: template.name,
      fields: template.fields.map(toVisitField),
      consequence: linkOf.get(c.componentTypeId)?.consequence ?? null,
    };
  });
}

export type ComponentFinding = {
  componentId: string;
  templateId: string;
  notes: string | null;
  values: Array<{ fieldId: string; value: string }>;
};

type ResultWrite = { fieldId: string } & Pick<
  Prisma.InspectionResultCreateManyInput,
  "numberValue" | "textValue" | "booleanValue" | "dateValue"
>;

/**
 * Check one component's answers against its form, before anything is
 * written: a visit is saved whole or not at all as far as validation can
 * tell, so a bad reading on the fifth part doesn't leave four saved.
 */
export function checkComponentFinding(component: VisitComponent, finding: ComponentFinding): ResultWrite[] {
  if (finding.templateId !== component.templateId) {
    throw new Error(`The form for ${component.label} has changed — reload the page and try again`);
  }
  const byId = new Map(component.fields.map((f) => [f.id, f]));
  const writes: ResultWrite[] = [];
  for (const v of finding.values) {
    const field = byId.get(v.fieldId);
    if (!field) throw new Error(`An answer for ${component.label} is not on its form`);
    const raw = v.value.trim();
    if (raw === "") continue;
    switch (field.dataType) {
      case "NUMBER": {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new Error(`${component.label} — ${field.label}: "${raw}" is not a number`);
        if ((field.min != null && n < field.min) || (field.max != null && n > field.max)) {
          throw new Error(`${component.label} — ${field.label} must be between ${field.min ?? "…"} and ${field.max ?? "…"}`);
        }
        writes.push({ fieldId: field.id, numberValue: n });
        break;
      }
      case "BOOLEAN":
        writes.push({ fieldId: field.id, booleanValue: raw === "true" });
        break;
      case "DATE": {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) throw new Error(`${component.label} — ${field.label}: "${raw}" is not a date`);
        writes.push({ fieldId: field.id, dateValue: d });
        break;
      }
      case "ENUM":
        if (field.options.length > 0 && !field.options.includes(raw)) {
          throw new Error(`${component.label} — ${field.label}: "${raw}" is not one of its options`);
        }
        writes.push({ fieldId: field.id, textValue: raw });
        break;
      default:
        writes.push({ fieldId: field.id, textValue: raw });
    }
  }
  for (const field of component.fields) {
    if (field.isRequired && !writes.some((w) => w.fieldId === field.id)) {
      throw new Error(`${component.label} — ${field.label} is required, or mark it not inspected on this visit`);
    }
  }
  return writes;
}

/**
 * File one component's findings as part of a visit: the child inspection,
 * its answers, and the condition and risk they produce.
 */
export async function recordComponentFinding(
  organizationId: string,
  visit: { id: string; assetId: string; inspectorId: string; inspectionDate: Date; inspectionType: string },
  component: VisitComponent,
  finding: ComponentFinding,
  results: ResultWrite[]
) {
  const child = await prisma.inspection.create({
    data: {
      assetId: visit.assetId,
      assetComponentId: component.id,
      parentInspectionId: visit.id,
      templateId: component.templateId,
      inspectorId: visit.inspectorId,
      inspectionDate: visit.inspectionDate,
      inspectionType: visit.inspectionType,
      notes: finding.notes,
      results: { create: results },
    },
    select: { id: true },
  });

  const conditionField = component.fields.find((f) => f.code === CONDITION_READING.code);
  const rating = results.find((r) => r.fieldId === conditionField?.id)?.numberValue;
  if (rating != null) {
    const condition = conditionFromRating(rating);
    await recordComponentScores(organizationId, component.id, {
      observedAt: visit.inspectionDate,
      conditionScore: condition,
      probability: probabilityFromCondition(condition),
      consequence: component.consequence,
      inspectionId: child.id,
    });
  }
  return child;
}

export type ComponentReading = { label: string; value: string };
export type LatestReadings = { inspectionId: string; visitId: string | null; date: Date; readings: ComponentReading[] };

/** A recorded answer as a person reads it, with its unit. */
export function formatReading(
  field: { dataType: AttributeDataType; unit: string | null },
  result: { numberValue: number | null; textValue: string | null; booleanValue: boolean | null; dateValue: Date | null }
): string | null {
  if (result.booleanValue != null) return result.booleanValue ? "Yes" : "No";
  if (result.numberValue != null) {
    const unit = field.unit ?? "";
    return unit === "%" ? `${result.numberValue}%` : `${result.numberValue}${unit ? ` ${unit}` : ""}`;
  }
  if (result.dateValue != null) return result.dateValue.toISOString().slice(0, 10);
  return result.textValue;
}

/**
 * What the most recent inspection of each component found. The condition
 * rating is left out — the component's score already says it.
 */
export async function latestComponentReadings(componentIds: string[]): Promise<Map<string, LatestReadings>> {
  if (componentIds.length === 0) return new Map();
  const inspections = await prisma.inspection.findMany({
    where: { assetComponentId: { in: componentIds } },
    orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
    include: { results: { include: { field: true } } },
  });
  const out = new Map<string, LatestReadings>();
  for (const i of inspections) {
    if (out.has(i.assetComponentId!)) continue;
    out.set(i.assetComponentId!, {
      inspectionId: i.id,
      visitId: i.parentInspectionId,
      date: i.inspectionDate,
      readings: [...i.results]
        .filter((r) => r.field.code !== CONDITION_READING.code)
        .sort((a, b) => a.field.sortOrder - b.field.sortOrder)
        .map((r) => ({ label: r.field.label, value: formatReading(r.field, r) }))
        .filter((r): r is ComponentReading => r.value != null),
    });
  }
  return out;
}

export type VisitPart = {
  id: string;
  label: string;
  componentTypeName: string;
  templateName: string;
  notes: string | null;
  condition: number | null;
  risk: number | null;
  readings: Array<ComponentReading & { code: string }>;
};

/** The components looked at on one visit, with what was found on each. */
export async function getVisitParts(organizationId: string, visitId: string): Promise<VisitPart[]> {
  const parts = await prisma.inspection.findMany({
    where: { parentInspectionId: visitId, asset: { organizationId } },
    include: {
      template: { select: { name: true } },
      assetComponent: { include: { componentType: { select: { name: true } } } },
      results: { include: { field: true } },
      conditionMeasurements: { select: { score: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const risks = await prisma.riskAssessment.findMany({
    where: {
      assetComponentId: { in: parts.map((p) => p.assetComponentId!).filter(Boolean) },
      assessmentDate: { in: [...new Set(parts.map((p) => p.inspectionDate))] },
    },
    select: { assetComponentId: true, riskScore: true },
  });
  const riskOf = new Map(risks.map((r) => [r.assetComponentId, r.riskScore]));

  return parts.map((p) => ({
    id: p.id,
    label: p.assetComponent?.label ?? p.assetComponent?.componentType.name ?? "Component",
    componentTypeName: p.assetComponent?.componentType.name ?? "",
    templateName: p.template.name,
    notes: p.notes,
    condition: p.conditionMeasurements[0]?.score ?? null,
    risk: riskOf.get(p.assetComponentId) ?? null,
    readings: [...p.results]
      .sort((a, b) => a.field.sortOrder - b.field.sortOrder)
      .map((r) => ({ code: r.field.code, label: r.field.label, value: formatReading(r.field, r) }))
      .filter((r): r is ComponentReading & { code: string } => r.value != null),
  }));
}
