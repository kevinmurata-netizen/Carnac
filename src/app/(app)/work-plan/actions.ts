"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { WorkPlanItemStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import {
  generateWorkPlan,
  createWorkPlanFromScenario,
  moveWorkPlanItem,
  updateWorkPlanItemStatus,
  deleteWorkPlan,
  searchSegments,
  previewWorkPlanAddition,
  addWorkPlanItem,
  removeWorkPlanItem,
  segmentRowsInPlan,
  previewCombine,
  combineWorkPlanItems,
  splitWorkPlanVisit,
} from "@/server/workplans";
import { previewWorkPlanImport, commitWorkPlanImport, type WorkPlanImportPreview } from "@/server/workplan-import";
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
    categoryWeights: categories.weights,
    caps: categories.caps,
    categoryWeightSetId: categories.categoryWeightSetId,
  });

  redirect(`/work-plan/${result.workPlanId}`);
}

/**
 * A plan from a scenario: the run's own funded work, as rows you can move.
 *
 * The scenario is run as it stands, so the plan matches what Scenario Planning
 * would show for it right now rather than whatever was stored last time.
 */
export async function createFromScenarioAction(formData: FormData) {
  const session = await requireEditor();
  const scenarioId = String(formData.get("scenarioId") ?? "").trim();
  if (!scenarioId) throw new Error("Choose a scenario to plan from");

  const { workPlanId } = await createWorkPlanFromScenario(
    session.user.organizationId,
    scenarioId,
    String(formData.get("name") ?? "")
  );
  revalidatePath("/work-plan");
  redirect(`/work-plan/${workPlanId}`);
}

/** Segments for the add-work picker. */
export async function searchSegmentsAction(query: string) {
  const session = await requireEditor();
  return searchSegments(session.user.organizationId, query);
}

/** What adding this treatment here would mean, before anything is written. */
export async function previewAdditionAction(input: { assetId: string; treatmentId: string }) {
  const session = await requireEditor();
  try {
    return { ok: true as const, preview: await previewWorkPlanAddition(session.user.organizationId, input) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "Could not price that work" };
  }
}

export async function addWorkPlanItemAction(input: {
  workPlanId: string;
  assetId: string;
  treatmentId: string;
  year: number;
}) {
  const session = await requireEditor();
  try {
    const { added } = await addWorkPlanItem(session.user.organizationId, input);
    revalidatePath(`/work-plan/${input.workPlanId}`);
    return {
      ok: true as const,
      message: `${added.treatment} added to ${added.assetCode} in ${input.year}${added.qualifies ? "" : ", against its rules"}.`,
    };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "Could not add that work" };
  }
}

/** The other work this plan holds on the same segment, for the combine picker. */
export async function segmentRowsAction(workPlanId: string, assetId: string) {
  await requireEditor();
  return segmentRowsInPlan(workPlanId, assetId);
}

export async function previewCombineAction(input: { workPlanId: string; itemIds: string[]; year: number }) {
  const session = await requireEditor();
  try {
    return { ok: true as const, preview: await previewCombine(session.user.organizationId, input) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "Could not price that project" };
  }
}

export async function combineItemsAction(input: { workPlanId: string; itemIds: string[]; year: number }) {
  const session = await requireEditor();
  try {
    const preview = await combineWorkPlanItems(session.user.organizationId, input);
    revalidatePath(`/work-plan/${input.workPlanId}`);
    return {
      ok: true as const,
      message: `${preview.name} on ${preview.assetCode} is now one project in ${input.year}${
        preview.saving > 0 ? `, saving $${preview.saving.toLocaleString("en-US")}` : ""
      }.`,
    };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "Could not combine that work" };
  }
}

/** A spreadsheet upload, read into memory. Capped well under what a request
 * may carry, with a message rather than a failed request. */
async function uploadedSheet(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a spreadsheet to import.");
  if (file.size > 3 * 1024 * 1024) {
    throw new Error("That file is over 3 MB. Remove other sheets or columns and try again.");
  }
  return { name: file.name, bytes: await file.arrayBuffer() };
}

type ImportOutcome =
  | { ok: true; preview: WorkPlanImportPreview; imported: number | null }
  | { ok: false; message: string };

/** Check a spreadsheet against the plan and the library; writes nothing. */
export async function previewImportAction(formData: FormData): Promise<ImportOutcome> {
  const session = await requireEditor();
  try {
    const workPlanId = String(formData.get("workPlanId") ?? "");
    const preview = await previewWorkPlanImport(session.user.organizationId, workPlanId, await uploadedSheet(formData));
    return { ok: true, preview, imported: null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not read that file" };
  }
}

/** Import it — checked again first, and refused while any row has an error. */
export async function commitImportAction(formData: FormData): Promise<ImportOutcome> {
  const session = await requireEditor();
  try {
    const workPlanId = String(formData.get("workPlanId") ?? "");
    const result = await commitWorkPlanImport(session.user.organizationId, workPlanId, await uploadedSheet(formData));
    if (result.imported > 0) revalidatePath(`/work-plan/${workPlanId}`);
    return { ok: true, preview: result.preview, imported: result.imported };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not import that file" };
  }
}

export async function splitVisitAction(formData: FormData) {
  const session = await requireEditor();
  const workPlanId = String(formData.get("workPlanId") ?? "");
  const bundleId = String(formData.get("bundleId") ?? "");
  if (!workPlanId || !bundleId) throw new Error("Plan and project are required");
  await splitWorkPlanVisit(session.user.organizationId, workPlanId, bundleId);
  revalidatePath(`/work-plan/${workPlanId}`);
}

export async function removeItemAction(formData: FormData) {
  await requireEditor();
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) throw new Error("Item is required");
  const workPlanId = await removeWorkPlanItem(itemId);
  revalidatePath(`/work-plan/${workPlanId}`);
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
