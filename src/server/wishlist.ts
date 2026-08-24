import { prisma } from "@/lib/prisma";
import { WishlistPriority } from "@prisma/client";

/**
 * A shared list of requests and ideas, writable by anyone signed in.
 *
 * Unlike the rest of Administration this is not Administrator-only on purpose:
 * it exists so whoever is reviewing the app can record what they want, and a
 * list only an administrator could write to would collect nothing.
 */

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;

export type WishlistRow = {
  id: string;
  title: string;
  description: string | null;
  priority: WishlistPriority;
  isDone: boolean;
  createdByName: string | null;
  createdAt: Date;
};

const PRIORITY_RANK: Record<WishlistPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export async function listWishlist(organizationId: string): Promise<WishlistRow[]> {
  const items = await prisma.wishlistItem.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  // Outstanding work first, highest priority at the top; done items sink to the
  // bottom in the order they were added.
  return items.sort((a, b) => {
    if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
    const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (rank !== 0) return rank;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export function parsePriority(value: unknown): WishlistPriority {
  return (PRIORITIES as readonly string[]).includes(String(value))
    ? (String(value) as WishlistPriority)
    : "MEDIUM";
}

export async function createWishlistItem(
  organizationId: string,
  input: { title: string; description: string | null; priority: WishlistPriority; createdByName: string | null }
) {
  const title = input.title.trim();
  if (!title) throw new Error("Give the item a title");
  if (title.length > 200) throw new Error("Keep the title under 200 characters — use the description for detail");

  await prisma.wishlistItem.create({
    data: {
      organizationId,
      title,
      description: input.description?.trim() || null,
      priority: input.priority,
      createdByName: input.createdByName,
    },
  });
}

export async function updateWishlistItem(
  organizationId: string,
  id: string,
  input: { title: string; description: string | null; priority: WishlistPriority }
) {
  const title = input.title.trim();
  if (!title) throw new Error("Give the item a title");

  // Scoped by organization so an id from elsewhere cannot be edited.
  const existing = await prisma.wishlistItem.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("That item no longer exists");

  await prisma.wishlistItem.update({
    where: { id },
    data: { title, description: input.description?.trim() || null, priority: input.priority },
  });
}

export async function setWishlistDone(organizationId: string, id: string, isDone: boolean) {
  const existing = await prisma.wishlistItem.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("That item no longer exists");
  await prisma.wishlistItem.update({ where: { id }, data: { isDone } });
}

export async function deleteWishlistItem(organizationId: string, id: string) {
  const existing = await prisma.wishlistItem.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("That item no longer exists");
  await prisma.wishlistItem.delete({ where: { id } });
}

export async function getWishlistSummary(organizationId: string) {
  const items = await prisma.wishlistItem.findMany({
    where: { organizationId },
    select: { isDone: true, priority: true },
  });
  return {
    total: items.length,
    open: items.filter((i) => !i.isDone).length,
    done: items.filter((i) => i.isDone).length,
    highOpen: items.filter((i) => !i.isDone && i.priority === "HIGH").length,
  };
}
