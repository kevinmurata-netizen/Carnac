import { AttributeDataType, PrismaClient } from "@prisma/client";

/**
 * Writing one asset and its attribute values.
 *
 * Shared by the four importers because the awkward part is the same for all of
 * them: attribute values are rows against definitions, each value living in the
 * column its definition's type says — text, number, date, boolean — and a
 * definition that does not exist is a mistake in the importer rather than
 * something to write around.
 *
 * No `AssetLocation` is written. Its geometry column is NOT NULL, and JVWCD's
 * facility coordinates are GRAMA-protected, so there is nothing honest to put
 * there yet; Phase 5 decides between geocoded addresses and flagged synthetic
 * points, and creates the rows then. An asset without a location is valid.
 */

export type AttributeValues = Record<string, string | number | Date | boolean | null | undefined>;

export type AssetInput = {
  assetCode: string;
  name: string;
  installationDate?: Date | null;
  expectedUsefulLife?: number | null;
  attributes: AttributeValues;
};

/** The definitions for one asset type, by code, so values can be matched to
 * them without a query per value. */
export async function definitionsFor(prisma: PrismaClient, assetTypeId: string) {
  const defs = await prisma.assetAttributeDefinition.findMany({
    where: { assetTypeId },
    select: { id: true, code: true, dataType: true },
  });
  return new Map(defs.map((d) => [d.code, d]));
}

export async function assetTypeByCode(prisma: PrismaClient, code: string) {
  const type = await prisma.assetType.findUnique({ where: { code }, select: { id: true } });
  if (!type) throw new Error(`Asset type ${code} does not exist — run the asset type seed first.`);
  return type.id;
}

/**
 * Create the asset and its values in one transaction, so a row is never left
 * half-described if a value is wrong.
 */
export async function writeAsset(
  prisma: PrismaClient,
  args: {
    organizationId: string;
    assetTypeId: string;
    definitions: Awaited<ReturnType<typeof definitionsFor>>;
    input: AssetInput;
  }
) {
  const { organizationId, assetTypeId, definitions, input } = args;

  const values: Array<{ definitionId: string; textValue?: string; numberValue?: number; dateValue?: Date; booleanValue?: boolean }> = [];
  for (const [code, raw] of Object.entries(input.attributes)) {
    if (raw == null || raw === "") continue;
    const definition = definitions.get(code);
    if (!definition) throw new Error(`${input.assetCode}: no attribute definition ${code} on this asset type`);

    switch (definition.dataType) {
      case AttributeDataType.NUMBER: {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n)) throw new Error(`${input.assetCode}: ${code} is not a number (${String(raw)})`);
        values.push({ definitionId: definition.id, numberValue: n });
        break;
      }
      case AttributeDataType.DATE: {
        const d = raw instanceof Date ? raw : new Date(String(raw));
        if (Number.isNaN(d.getTime())) throw new Error(`${input.assetCode}: ${code} is not a date (${String(raw)})`);
        values.push({ definitionId: definition.id, dateValue: d });
        break;
      }
      case AttributeDataType.BOOLEAN:
        values.push({ definitionId: definition.id, booleanValue: Boolean(raw) });
        break;
      default:
        values.push({ definitionId: definition.id, textValue: String(raw) });
    }
  }

  await prisma.asset.create({
    data: {
      organizationId,
      assetTypeId,
      assetCode: input.assetCode,
      name: input.name,
      status: "ACTIVE",
      installationDate: input.installationDate ?? null,
      expectedUsefulLife: input.expectedUsefulLife ?? null,
      attributeValues: { create: values },
    },
  });
}
