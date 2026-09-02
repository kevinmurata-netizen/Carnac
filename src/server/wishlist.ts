import { prisma } from "@/lib/prisma";
import { listRenameablePages } from "@/server/navigation";
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
  /** Page href this idea is about, or null when it is not about one place. */
  location: string | null;
  /** That page's current name, resolved at read time. */
  locationLabel: string | null;
};

/**
 * Where in the app an idea applies.
 *
 * Stored as the page's href rather than its name, so tagging survives that
 * page being renamed — the label is resolved when the list is read. The
 * options are the same set the Navigation page can rename, so a page can never
 * be tagged that does not exist.
 */
export async function listWishlistLocations(
  organizationId: string
): Promise<Array<{ href: string; label: string; group: string }>> {
  const sections = await listRenameablePages(organizationId);
  return sections
    .filter((section) => section.group !== "Sidebar Sections")
    .flatMap((section) => section.items.map((i) => ({ href: i.href, label: i.label, group: section.group })));
}

const PRIORITY_RANK: Record<WishlistPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export async function listWishlist(
  organizationId: string,
  filters: { location?: string } = {}
): Promise<WishlistRow[]> {
  const [items, locations] = await Promise.all([
    prisma.wishlistItem.findMany({
      where: {
        organizationId,
        // "untagged" is a real choice, not the absence of one — it is how you
        // find the ideas nobody has placed yet.
        ...(filters.location === UNTAGGED
          ? { location: null }
          : filters.location
            ? { location: filters.location }
            : {}),
      },
      orderBy: { createdAt: "desc" },
    }),
    listWishlistLocations(organizationId),
  ]);

  const labelFor = new Map(locations.map((l) => [l.href, l.label]));

  // Outstanding work first, highest priority at the top; done items sink to the
  // bottom in the order they were added.
  return items
    .sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (rank !== 0) return rank;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((item) => ({
      ...item,
      // A tag pointing at a page that no longer exists still shows its href,
      // rather than silently reading as untagged.
      locationLabel: item.location ? (labelFor.get(item.location) ?? item.location) : null,
    }));
}

/** Sentinel for "has no location", so the filter can express it in a URL. */
export const UNTAGGED = "__untagged";

/** How many open ideas sit against each page, so the filter can show where the
 * requests are actually piling up. */
export async function countWishlistByLocation(
  organizationId: string
): Promise<{ byHref: Map<string, number>; untagged: number }> {
  const rows = await prisma.wishlistItem.groupBy({
    by: ["location"],
    where: { organizationId, isDone: false },
    _count: { _all: true },
  });

  const byHref = new Map<string, number>();
  let untagged = 0;
  for (const row of rows) {
    if (row.location) byHref.set(row.location, row._count._all);
    else untagged += row._count._all;
  }
  return { byHref, untagged };
}

export function parsePriority(value: unknown): WishlistPriority {
  return (PRIORITIES as readonly string[]).includes(String(value))
    ? (String(value) as WishlistPriority)
    : "MEDIUM";
}

export async function createWishlistItem(
  organizationId: string,
  input: {
    title: string;
    description: string | null;
    priority: WishlistPriority;
    location: string | null;
    createdByName: string | null;
  }
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
      location: await validLocation(organizationId, input.location),
      createdByName: input.createdByName,
    },
  });
}

/** Only hrefs the app actually has are stored, so a crafted form cannot tag an
 * item with arbitrary text that would then appear in the filter. */
async function validLocation(organizationId: string, href: string | null): Promise<string | null> {
  if (!href) return null;
  const allowed = await listWishlistLocations(organizationId);
  return allowed.some((l) => l.href === href) ? href : null;
}

export async function updateWishlistItem(
  organizationId: string,
  id: string,
  input: { title: string; description: string | null; priority: WishlistPriority; location: string | null }
) {
  const title = input.title.trim();
  if (!title) throw new Error("Give the item a title");

  // Scoped by organization so an id from elsewhere cannot be edited.
  const existing = await prisma.wishlistItem.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error("That item no longer exists");

  await prisma.wishlistItem.update({
    where: { id },
    data: {
      title,
      description: input.description?.trim() || null,
      priority: input.priority,
      location: await validLocation(organizationId, input.location),
    },
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
