"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { WorkPlanItemStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import {
  generateWorkPlan,
  moveWorkPlanItem,
  updateWorkPlanItemStatus,
  deleteWorkPlan,
} from "@/server/workplans";
import { resolveWeights } from "@/server/weight-sets";
import { resolveCategoryWeights } from "@/server/category-weight-sets";

const generateSchema = z.object({
  name: z.string().min(1, "Plan name is required"),
  startYear: z.coerce.number().int().min(2000).max(2100),
  years: z.coerce.number().int().min(1).max(20),
  annualBudget: z.coerce.number().min(0),
  fundingGrowthPct: z.coerce.number().min(-50).max(50),
  /** Empty means "whatever the organization's default set says". */
  weightSetId: z.string().optional(),
  categoryWeightSetId: z.string().optional(),
});

async function requireEditor() {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) {
    throw new Error("You do not have permission to change work plans");
  }
  return session;
}

export async function generateWorkPlanAction(formData: FormData) {
  const session = await requireEditor();
  const parsed = generateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid work plan settings");
  }
  const d = parsed.data;

  // Resolved rather than trusted: the id is checked against this organization,
  // and a missing or unknown set falls back to the default instead of failing
  // a generation run over a dropdown.
  const chosen = await resolveWeights(session.user.organizationId, d.weightSetId?.trim() || null);
  const categories = await resolveCategoryWeights(
    session.user.organizationId,
    d.categoryWeightSetId?.trim() || null
  );

  const result = await generateWorkPlan(session.user.organizationId, {
    name: d.name,
    startYear: d.startYear,
    years: d.years,
    annualBudget: d.annualBudget,
    fundingGrowth: d.fundingGrowthPct / 100,
    weights: chosen.weights,
    weightSetId: chosen.weightSetId,
    caps: categories.caps,
    categoryWeightSetId: categories.categoryWeightSetId,
  });

  redirect(`/work-plan/${result.workPlanId}`);
}

export async function moveItemAction(formData: FormData) {
  await requireEditor();
  const itemId = String(formData.get("itemId") ?? "");
  const targetYear = Number(formData.get("targetYear"));
  if (!itemId || !Number.isFinite(targetYear)) throw new Error("Item and target year are required");

  const workPlanId = await moveWorkPlanItem(itemId, targetYear);
  revalidatePath(`/work-plan/${workPlanId}`);
}

export async function updateStatusAction(formData: FormData) {
  await requireEditor();
  const itemId = String(formData.get("itemId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!itemId || !(status in WorkPlanItemStatus)) throw new Error("Item and a valid status are required");

  const workPlanId = await updateWorkPlanItemStatus(itemId, status as WorkPlanItemStatus);
  revalidatePath(`/work-plan/${workPlanId}`);
}

export async function deleteWorkPlanAction(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("workPlanId") ?? "");
  if (!id) throw new Error("Work plan id is required");
  await deleteWorkPlan(id);
  redirect("/work-plan");
}
