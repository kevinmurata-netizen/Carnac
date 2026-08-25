"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
  runFilter,
  type FilterDefinition,
  type FilterResult,
} from "@/server/saved-filters";
import type { Criterion } from "@/server/filter-schema";

async function requireUser() {
  const session = await auth();
  if (!session) throw new Error("Sign in to use filters");
  return session;
}

/** Running is read-only, so it returns the result rather than revalidating. */
export async function runFilterAction(
  fields: string[],
  criteria: Criterion[],
  matchAll: boolean
): Promise<FilterResult> {
  const session = await requireUser();
  return runFilter(session.user.organizationId, fields, criteria, matchAll);
}

export async function saveFilterAction(definition: FilterDefinition, id?: string): Promise<string> {
  const session = await requireUser();

  if (id) {
    await updateSavedFilter(session.user.organizationId, id, definition);
  } else {
    await createSavedFilter(session.user.organizationId, {
      ...definition,
      createdByName: session.user.name ?? session.user.email ?? null,
    });
  }

  revalidatePath("/filters");
  return id ? `Updated "${definition.name}".` : `Saved "${definition.name}".`;
}

export async function deleteFilterAction(id: string) {
  const session = await requireUser();
  await deleteSavedFilter(session.user.organizationId, id);
  revalidatePath("/filters");
}
