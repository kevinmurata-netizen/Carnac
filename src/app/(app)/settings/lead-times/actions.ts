"use server";

import { revalidatePath } from "next/cache";
import { requireCardWrite } from "@/server/guard";
import {
  createLeadTimeSet,
  updateLeadTimeSet,
  deleteLeadTimeSet,
  setDefaultLeadTimeSet,
  clearDefaultLeadTimeSet,
  copyLeadTimeSet,
  type LeadTimeSetInput,
} from "@/server/lead-times";
import { CATEGORY_KEYS } from "@/domain/waterline/category-weight";
import type { CashInstalment, LeadTime } from "@/domain/waterline/lead-time";
import type { TreatmentCategory } from "@/domain/waterline/treatment";

const CARD = "/settings/lead-times";

/** Lead times decide when money leaves and when the network improves, so
 * changing them carries the same bar as changing a treatment. */
async function requireWriteAccess() {
  return requireCardWrite(CARD, "Only an Administrator can change delivery lead times");
}

function revalidateAffected() {
  for (const path of [CARD, "/scenario-planning", "/work-plan"]) revalidatePath(path);
}

type State = { status: "idle" | "success" | "error"; message?: string };

/**
 * The offsets, posted as one JSON field.
 *
 * Read defensively rather than trusted: this decides which year a project's
 * money comes out of, and a malformed field should be a message rather than a
 * set that quietly reads as "everything immediately".
 */
function parseLead(raw: unknown, label: string): LeadTime {
  const value = (raw ?? {}) as { fundOffset?: unknown; buildOffset?: unknown; cash?: unknown };
  const fundOffset = Number(value.fundOffset);
  const buildOffset = Number(value.buildOffset);
  if (!Number.isFinite(fundOffset) || !Number.isFinite(buildOffset)) {
    throw new Error(`${label}: the years must be numbers`);
  }
  const cash: CashInstalment[] = Array.isArray(value.cash)
    ? value.cash.map((entry) => {
        const i = entry as { offset?: unknown; percent?: unknown };
        return { offset: Number(i.offset), percent: Number(i.percent) };
      })
    : [];
  return { fundOffset, buildOffset, cash };
}

function parse(form: FormData): LeadTimeSetInput {
  const raw = form.get("lead");
  if (typeof raw !== "string" || !raw.trim()) throw new Error("Could not read the lead times. Try again.");

  let parsed: { byCategory?: Record<string, unknown>; overrides?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Could not read the lead times. Try again.");
  }

  const byCategory = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [key, parseLead(parsed.byCategory?.[key], key)])
  ) as Record<TreatmentCategory, LeadTime>;

  const overrides = (Array.isArray(parsed.overrides) ? parsed.overrides : []).map((entry) => {
    const o = entry as { treatmentId?: unknown; lead?: unknown };
    return { treatmentId: String(o.treatmentId ?? ""), lead: parseLead(o.lead, "That treatment") };
  });

  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? "").trim() || null,
    byCategory,
    overrides,
  };
}

export async function saveLeadTimeSetAction(_prev: State, formData: FormData): Promise<State> {
  try {
    const session = await requireWriteAccess();
    const id = String(formData.get("id") ?? "").trim();
    const input = parse(formData);

    if (id) await updateLeadTimeSet(session.user.organizationId, id, input);
    else await createLeadTimeSet(session.user.organizationId, input);

    revalidateAffected();
    return {
      status: "success",
      message: id
        ? "Saved. Scenarios using these lead times run by them from the next run."
        : "Created. Choose it on a scenario to run by it.",
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not save the lead times" };
  }
}

export async function setDefaultLeadTimeSetAction(_prev: State, formData: FormData): Promise<State> {
  try {
    const session = await requireWriteAccess();
    const id = String(formData.get("id") ?? "").trim();

    if (!id) {
      await clearDefaultLeadTimeSet(session.user.organizationId);
      revalidateAffected();
      return { status: "success", message: "Default cleared. Work is decided, paid for and built in the same year." };
    }

    await setDefaultLeadTimeSet(session.user.organizationId, id);
    revalidateAffected();
    return { status: "success", message: "Default changed." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not change the default" };
  }
}

export async function copyLeadTimeSetAction(_prev: State, formData: FormData): Promise<State> {
  try {
    const session = await requireWriteAccess();
    await copyLeadTimeSet(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAffected();
    return { status: "success", message: "Copied. Change the copy rather than the set your scenarios use." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not copy the lead times" };
  }
}

export async function deleteLeadTimeSetAction(_prev: State, formData: FormData): Promise<State> {
  try {
    const session = await requireWriteAccess();
    await deleteLeadTimeSet(session.user.organizationId, String(formData.get("id") ?? ""));
    revalidateAffected();
    return { status: "success", message: "Lead times deleted." };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Could not delete the lead times" };
  }
}
