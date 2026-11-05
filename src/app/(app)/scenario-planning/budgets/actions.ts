"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import {
  createBudgetPlan,
  deleteBudgetPlan,
  updateBudgetPlan,
  type BudgetPlanInput,
} from "@/server/budget-plans";
import type { BudgetPlanLine } from "@/domain/waterline/budget-plan";

export type BudgetFormState = { status: "idle" | "error"; message?: string };

async function organizationFor(verb: string): Promise<string> {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) throw new Error(`You do not have permission to ${verb} budgets`);
  return session.user.organizationId;
}

/** The editor posts its table as JSON: a year's row is several lines, and
 * rows come and go as years are added, which a flat form would have to
 * reconstruct from field names. The server checks every line regardless. */
function parse(formData: FormData): BudgetPlanInput {
  let lines: BudgetPlanLine[];
  try {
    const raw = JSON.parse(String(formData.get("lines") ?? "[]"));
    if (!Array.isArray(raw)) throw new Error();
    lines = raw.map((l) => ({
      year: Number(l.year),
      assetTypeId: l.assetTypeId ? String(l.assetTypeId) : null,
      category: l.category ? String(l.category) : null,
      amount: Number(l.amount),
    })) as BudgetPlanLine[];
  } catch {
    throw new Error("The budget's amounts could not be read");
  }
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "") || null,
    lines,
  };
}

/** A scenario following the plan shows its name, and its run follows its
 * amounts, so every scenario page is affected by a change. */
function revalidate() {
  revalidatePath("/scenario-planning", "layout");
}

export async function saveBudgetPlanAction(_prev: BudgetFormState, formData: FormData): Promise<BudgetFormState> {
  const id = String(formData.get("id") ?? "");
  try {
    const organizationId = await organizationFor(id ? "change" : "create");
    const input = parse(formData);
    if (id) await updateBudgetPlan(organizationId, id, input);
    else await createBudgetPlan(organizationId, input);
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not save the budget" };
  }
  revalidate();
  redirect("/scenario-planning/budgets");
}

export async function deleteBudgetPlanAction(formData: FormData) {
  const organizationId = await organizationFor("delete");
  await deleteBudgetPlan(organizationId, String(formData.get("id") ?? ""));
  revalidate();
  redirect("/scenario-planning/budgets");
}
