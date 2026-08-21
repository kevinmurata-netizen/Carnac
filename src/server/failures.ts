import { prisma } from "@/lib/prisma";

export async function listFailureTypes(organizationId: string) {
  return prisma.failureType.findMany({
    where: { assetType: { code: "WATERLINE", organizationId } },
    orderBy: { label: "asc" },
  });
}

export async function listFailuresForAsset(organizationId: string, assetId: string) {
  return prisma.failureEvent.findMany({
    where: { assetId, asset: { organizationId, deletedAt: null } },
    include: { failureType: true },
    orderBy: { failureDate: "desc" },
  });
}

export async function getRecentFailureCount(organizationId: string, sinceDays = 365) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  return prisma.failureEvent.count({
    where: { failureDate: { gte: since }, asset: { organizationId, deletedAt: null } },
  });
}

export type CreateFailureInput = {
  assetId: string;
  failureTypeId: string;
  failureDate: Date;
  severity: string;
  cause?: string;
  repairCost?: number;
  downtimeHours?: number;
  customersAffected?: number;
  restorationTime?: number;
  consequenceNotes?: string;
};

export async function createFailure(organizationId: string, input: CreateFailureInput) {
  const asset = await prisma.asset.findFirst({ where: { id: input.assetId, organizationId, deletedAt: null } });
  if (!asset) throw new Error("Asset not found");

  return prisma.failureEvent.create({
    data: {
      assetId: input.assetId,
      failureTypeId: input.failureTypeId,
      failureDate: input.failureDate,
      severity: input.severity,
      cause: input.cause || null,
      repairCost: input.repairCost,
      downtimeHours: input.downtimeHours,
      customersAffected: input.customersAffected,
      restorationTime: input.restorationTime,
      consequenceNotes: input.consequenceNotes || null,
    },
  });
}
