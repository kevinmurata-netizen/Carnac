"use server";

import { auth } from "@/lib/auth";
import { askAssistant, type AssistantResult } from "@/server/assistant";

export async function askAction(question: string): Promise<AssistantResult> {
  try {
    const session = await auth();
    if (!session) throw new Error("Sign in to ask a question");

    // Reads only. Every role may ask, because asking cannot change anything —
    // the assistant has no way to write, and the rows it returns are the same
    // ones the grids already show this user.
    return await askAssistant(session.user.organizationId, question);
  } catch (e) {
    return {
      kind: "message",
      text: e instanceof Error ? e.message : "Something went wrong asking that.",
    };
  }
}
