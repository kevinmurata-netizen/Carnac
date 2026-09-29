import type { PrismaClient } from "@prisma/client";
import { recordComponentScores } from "../src/server/components";
import { ensureRollupStrategies } from "../src/server/rollup";
import { editAttributes } from "../src/domain/components/attributes";
import { COMPONENT_TYPES, COMPOSITION, DEFAULT_OBSERVED_AT, planComponentHistory } from "./component-plan";

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
        update: { defaultCostWeight: part.weight, sortOrder: i },
        create: {
          assetTypeId: assetType.id,
          componentTypeId: typeIds.get(part.code)!,
          defaultCostWeight: part.weight,
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
