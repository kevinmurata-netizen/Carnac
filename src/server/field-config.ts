import { prisma } from "@/lib/prisma";
import { AttributeDataType, Prisma } from "@prisma/client";
import { getIndexWeights } from "@/server/condition-model";

/**
 * Editing for the two field definitions that shape data collection:
 *   - InspectionTemplateField  → what an inspector is asked
 *   - AssetAttributeDefinition → what the inventory records
 *
 * Both are already data-driven; this exposes them for editing. Deletion is
 * guarded: a definition with recorded values cannot be removed, because doing
 * so would take real field observations with it. The guard reports the count
 * so the decision is informed rather than blocked blindly.
 */

export const EDITABLE_DATA_TYPES: AttributeDataType[] = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "ENUM"];

// ---------------------------------------------------------------------------
// Inspection fields
// ---------------------------------------------------------------------------

export type InspectionFieldRow = {
  id: string;
  code: string;
  label: string;
  dataType: AttributeDataType;
  unit: string | null;
  isRequired: boolean;
  sortOrder: number;
  helpText: string | null;
  resultCount: number;
  /** Numeric fields carrying an index weight drive the condition score. */
  indexWeight: number | null;
};

export async function listInspectionFields(organizationId: string): Promise<InspectionFieldRow[]> {
  const template = await prisma.inspectionTemplate.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId }, isActive: true },
    include: { fields: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { results: true } } } } },
  });
  if (!template) return [];

  const weights = await getIndexWeights(organizationId);
  return template.fields.map((f) => ({
    id: f.id,
    code: f.code,
    label: f.label,
    dataType: f.dataType,
    unit: f.unit,
    isRequired: f.isRequired,
    sortOrder: f.sortOrder,
    helpText: (f.config as { helpText?: string } | null)?.helpText ?? null,
    resultCount: f._count.results,
    indexWeight: f.code in weights ? weights[f.code] : null,
  }));
}

export async function updateInspectionField(
  organizationId: string,
  fieldId: string,
  input: { label: string; unit: string | null; isRequired: boolean; sortOrder: number; helpText: string | null }
) {
  const field = await prisma.inspectionTemplateField.findFirst({
    where: { id: fieldId, template: { assetType: { code: "WATERLINE", organizationId } } },
  });
  if (!field) throw new Error("Inspection field not found");
  if (!input.label.trim()) throw new Error("Label is required");

  const config = (field.config ?? {}) as Prisma.JsonObject;
  await prisma.inspectionTemplateField.update({
    where: { id: fieldId },
    data: {
      label: input.label.trim(),
      unit: input.unit?.trim() || null,
      isRequired: input.isRequired,
      sortOrder: input.sortOrder,
      config: { ...config, helpText: input.helpText?.trim() || undefined },
    },
  });
}

export async function createInspectionField(
  organizationId: string,
  input: { code: string; label: string; dataType: AttributeDataType; unit?: string; isRequired: boolean; helpText?: string }
) {
  const template = await prisma.inspectionTemplate.findFirst({
    where: { assetType: { code: "WATERLINE", organizationId }, isActive: true },
    include: { fields: true },
  });
  if (!template) throw new Error("No active inspection template");

  const code = normalizeCode(input.code);
  if (!code) throw new Error("Field code is required");
  if (!input.label.trim()) throw new Error("Label is required");
  if (template.fields.some((f) => f.code === code)) {
    throw new Error(`An inspection field with code "${code}" already exists`);
  }

  const maxSort = template.fields.reduce((m, f) => Math.max(m, f.sortOrder), 0);
  await prisma.inspectionTemplateField.create({
    data: {
      templateId: template.id,
      code,
      label: input.label.trim(),
      dataType: input.dataType,
      unit: input.unit?.trim() || null,
      isRequired: input.isRequired,
      sortOrder: maxSort + 10,
      config: {
        ...(input.helpText?.trim() ? { helpText: input.helpText.trim() } : {}),
        ...(input.dataType === "NUMBER" ? { min: 0, max: 10 } : {}),
      },
    },
  });
}

export async function deleteInspectionField(organizationId: string, fieldId: string) {
  const field = await prisma.inspectionTemplateField.findFirst({
    where: { id: fieldId, template: { assetType: { code: "WATERLINE", organizationId } } },
    include: { _count: { select: { results: true } } },
  });
  if (!field) throw new Error("Inspection field not found");

  if (field._count.results > 0) {
    throw new Error(
      `"${field.label}" has ${field._count.results} recorded answer(s). Remove it from the Condition Index instead — deleting it would destroy that inspection data.`
    );
  }

  const weights = await getIndexWeights(organizationId);
  if (field.code in weights) {
    throw new Error(`"${field.label}" is still a Condition Index component. Remove it from the index first.`);
  }

  await prisma.inspectionTemplateField.delete({ where: { id: fieldId } });
}

// ---------------------------------------------------------------------------
// Inventory (asset attribute) fields
// ---------------------------------------------------------------------------

export type InventoryFieldRow = {
  id: string;
  code: string;
  label: string;
  dataType: AttributeDataType;
  unit: string | null;
  isRequired: boolean;
  sortOrder: number;
  options: string[];
  valueCount: number;
};

export async function listInventoryFields(organizationId: string): Promise<InventoryFieldRow[]> {
  const definitions = await prisma.assetAttributeDefinition.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { values: true } } },
  });

  return definitions.map((d) => ({
    id: d.id,
    code: d.code,
    label: d.label,
    dataType: d.dataType,
    unit: d.unit,
    isRequired: d.isRequired,
    sortOrder: d.sortOrder,
    options: ((d.config as { options?: string[] } | null)?.options ?? []) as string[],
    valueCount: d._count.values,
  }));
}

export async function updateInventoryField(
  organizationId: string,
  definitionId: string,
  input: { label: string; unit: string | null; isRequired: boolean; sortOrder: number; options: string[] }
) {
  const definition = await prisma.assetAttributeDefinition.findFirst({
    where: { id: definitionId, assetType: { code: "WATERLINE", organizationId } },
  });
  if (!definition) throw new Error("Inventory field not found");
  if (!input.label.trim()) throw new Error("Label is required");

  const config = (definition.config ?? {}) as Prisma.JsonObject;
  await prisma.assetAttributeDefinition.update({
    where: { id: definitionId },
    data: {
      label: input.label.trim(),
      unit: input.unit?.trim() || null,
      isRequired: input.isRequired,
      sortOrder: input.sortOrder,
      config: definition.dataType === "ENUM" ? { ...config, options: input.options } : config,
    },
  });
}

export async function createInventoryField(
  organizationId: string,
  input: { code: string; label: string; dataType: AttributeDataType; unit?: string; isRequired: boolean; options: string[] }
) {
  const assetType = await prisma.assetType.findFirst({ where: { code: "WATERLINE", organizationId } });
  if (!assetType) throw new Error("WATERLINE asset type not found");

  const code = normalizeCode(input.code);
  if (!code) throw new Error("Field code is required");
  if (!input.label.trim()) throw new Error("Label is required");
  if (input.dataType === "ENUM" && input.options.length === 0) {
    throw new Error("An ENUM field needs at least one option");
  }

  const existing = await prisma.assetAttributeDefinition.findFirst({
    where: { assetTypeId: assetType.id, code },
  });
  if (existing) throw new Error(`An inventory field with code "${code}" already exists`);

  const all = await prisma.assetAttributeDefinition.findMany({
    where: { assetTypeId: assetType.id },
    select: { sortOrder: true },
  });
  const maxSort = all.reduce((m, d) => Math.max(m, d.sortOrder), 0);

  await prisma.assetAttributeDefinition.create({
    data: {
      assetTypeId: assetType.id,
      code,
      label: input.label.trim(),
      dataType: input.dataType,
      unit: input.unit?.trim() || null,
      isRequired: input.isRequired,
      sortOrder: maxSort + 10,
      config: input.dataType === "ENUM" ? { options: input.options } : undefined,
    },
  });
}

export async function deleteInventoryField(organizationId: string, definitionId: string) {
  const definition = await prisma.assetAttributeDefinition.findFirst({
    where: { id: definitionId, assetType: { code: "WATERLINE", organizationId } },
    include: { _count: { select: { values: true } } },
  });
  if (!definition) throw new Error("Inventory field not found");

  if (definition._count.values > 0) {
    throw new Error(
      `"${definition.label}" holds ${definition._count.values} recorded value(s) and cannot be deleted. Clear those values first if removal is genuinely intended.`
    );
  }

  await prisma.assetAttributeDefinition.delete({ where: { id: definitionId } });
}

function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
