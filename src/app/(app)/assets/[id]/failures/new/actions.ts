"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { createFailure } from "@/server/failures";

const schema = z.object({
  assetId: z.string().min(1),
  failureTypeId: z.string().min(1, "Select a failure type"),
  failureDate: z.string().min(1, "Failure date is required"),
  severity: z.string().min(1),
  cause: z.string().optional(),
  repairCost: z.string().optional(),
  downtimeHours: z.string().optional(),
  customersAffected: z.string().optional(),
  restorationTime: z.string().optional(),
  consequenceNotes: z.string().optional(),
});

export async function createFailureAction(formData: FormData) {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) {
    throw new Error("You do not have permission to record failures");
  }
  const organizationId = session.user.organizationId;

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid failure data");
  }
  const data = parsed.data;

  await createFailure(organizationId, {
    assetId: data.assetId,
    failureTypeId: data.failureTypeId,
    failureDate: new Date(data.failureDate),
    severity: data.severity,
    cause: data.cause,
    repairCost: data.repairCost ? Number(data.repairCost) : undefined,
    downtimeHours: data.downtimeHours ? Number(data.downtimeHours) : undefined,
    customersAffected: data.customersAffected ? Number(data.customersAffected) : undefined,
    restorationTime: data.restorationTime ? Number(data.restorationTime) : undefined,
    consequenceNotes: data.consequenceNotes,
  });

  redirect(`/assets/${data.assetId}?tab=failures`);
}
