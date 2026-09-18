"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import {
  assignScenarioToSet,
  copyScenarioSet,
  createScenarioSet,
  deleteScenarioSet,
  updateScenarioSet,
  type ScenarioSetInput,
} from "@/server/scenario-sets";
import { runScenarioSet } from "@/server/scenarios";
import { SCENARIO_SET_STATUSES } from "@/lib/scenario-sets";

export type SetFormState = { status: "idle" | "success" | "error"; message?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Scenario set name is required"),
  description: z.string().optional(),
  baseYear: z.coerce.number({ message: "Base year must be a number" }).int("Base year must be a whole year"),
  planningPeriodYears: z.coerce
    .number({ message: "Planning period must be a number" })
    .int("Planning period must be whole years"),
  status: z.enum(SCENARIO_SET_STATUSES),
});

async function organizationFor(verb: string): Promise<string> {
  const session = await auth();
  if (!session || !canRecordFieldData(session)) throw new Error(`You do not have permission to ${verb} scenario sets`);
  return session.user.organizationId;
}

function parse(formData: FormData): ScenarioSetInput {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid scenario set");
  return parsed.data;
}

/** Everywhere a set's window shows up. Changing it changes what every member
 * scenario's page says about its own results. */
function revalidate(setId?: string) {
  revalidatePath("/scenario-planning", "layout");
  if (setId) revalidatePath(`/scenario-planning/sets/${setId}`);
}

export async function createScenarioSetAction(_prev: SetFormState, formData: FormData): Promise<SetFormState> {
  let id: string;
  try {
    const organizationId = await organizationFor("create");
    id = (await createScenarioSet(organizationId, parse(formData))).id;
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not create the scenario set" };
  }
  revalidate();
  redirect(`/scenario-planning/sets/${id}`);
}

export async function updateScenarioSetAction(_prev: SetFormState, formData: FormData): Promise<SetFormState> {
  const id = String(formData.get("id") ?? "");
  try {
    const organizationId = await organizationFor("edit");
    await updateScenarioSet(organizationId, id, parse(formData));
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Could not save the scenario set" };
  }
  revalidate(id);
  return { status: "success", message: "Saved." };
}

/** Copy a set and its scenarios, and open the copy — which is where every edit
 * that follows is going to happen. */
export async function copyScenarioSetAction(formData: FormData) {
  const organizationId = await organizationFor("create");
  // "pick" marks a form that chose scenarios, so unticking every one copies
  // the set alone rather than reading as "nothing was said, copy them all".
  const scenarioIds = formData.has("pick")
    ? formData.getAll("scenarioIds").map(String).filter(Boolean)
    : undefined;
  const copyId = await copyScenarioSet(organizationId, String(formData.get("id") ?? ""), scenarioIds);
  revalidate();
  redirect(`/scenario-planning/sets/${copyId}`);
}

export async function deleteScenarioSetAction(formData: FormData) {
  const organizationId = await organizationFor("delete");
  await deleteScenarioSet(organizationId, String(formData.get("id") ?? ""));
  revalidate();
  // Sets live on Scenario Planning itself now, so that is where "back" is.
  redirect("/scenario-planning");
}

/** Add a scenario to a set, moving it out of any other. Nothing runs: the
 * scenario's pages say its results are out of window until someone runs it,
 * rather than a click on "add" quietly spending a minute of simulation. */
export async function assignScenarioAction(formData: FormData) {
  const organizationId = await organizationFor("edit");
  const scenarioId = String(formData.get("scenarioId") ?? "");
  const setId = String(formData.get("setId") ?? "");
  await assignScenarioToSet(organizationId, scenarioId, setId);
  // Layout, because a move changes two sets' pages as well as the scenario's.
  revalidate();
}

export async function runScenarioSetAction(formData: FormData) {
  const organizationId = await organizationFor("run");
  const id = String(formData.get("id") ?? "");
  await runScenarioSet(organizationId, id);
  revalidate(id);
}
