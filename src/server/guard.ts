import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getSessionPermissions, resourceKey, type ResourceKind } from "@/server/permissions";

/**
 * The guard every governed page calls before rendering anything.
 *
 * Returns whether this role may also write, so a page asks once and gets both
 * answers. Denial redirects rather than rendering an empty shell, because a
 * page that loads its heading and then shows nothing reads as a bug.
 *
 * This is the real boundary for reading. Hiding a card or a sidebar entry is
 * presentation; refusing to render the page is what actually closes it, and a
 * bookmarked URL hits this the same as a click does.
 */
export async function requireAccess(
  kind: ResourceKind,
  href: string
): Promise<{ canWrite: boolean; roleName: string; organizationId: string }> {
  const session = await auth();
  if (!session) redirect("/login");

  const permissions = await getSessionPermissions(session);
  const resource = resourceKey(kind, href);

  if (!permissions.canRead(resource)) {
    redirect(`/no-access?from=${encodeURIComponent(href)}`);
  }

  return {
    canWrite: permissions.canWrite(resource),
    roleName: session.user.roleName,
    organizationId: session.user.organizationId,
  };
}

/** Shorthand for the Settings cards, which is most of what is governed. */
export function requireCard(href: string) {
  return requireAccess("card", href);
}

/** Shorthand for a sidebar page. */
export function requirePage(href: string) {
  return requireAccess("page", href);
}

/**
 * The write gate for a server action.
 *
 * Throwing here rather than redirecting: an action is not a navigation, and
 * the calling form surfaces the message. This is what actually prevents a
 * change — a page that hides its buttons still has a server action reachable
 * by anyone who can form the request, so the check has to live on this side.
 */
export async function requireCardWrite(href: string, message: string) {
  const session = await auth();
  if (!session) throw new Error("Sign in first");

  const permissions = await getSessionPermissions(session);
  if (!permissions.canWrite(resourceKey("card", href))) throw new Error(message);
  return session;
}

/**
 * Write access to any one of several cards.
 *
 * For an operation that belongs to more than one screen — recomputing risk
 * also recomputes criticality — so that whoever may change either of the
 * things that feed it may also run it.
 */
export async function requireAnyCardWrite(hrefs: string[], message: string) {
  const session = await auth();
  if (!session) throw new Error("Sign in first");

  const permissions = await getSessionPermissions(session);
  if (!hrefs.some((href) => permissions.canWrite(resourceKey("card", href)))) throw new Error(message);
  return session;
}

/** The same, for a page in the sidebar rather than a Settings card. */
export async function requirePageWrite(href: string, message: string) {
  const session = await auth();
  if (!session) throw new Error("Sign in first");

  const permissions = await getSessionPermissions(session);
  if (!permissions.canWrite(resourceKey("page", href))) throw new Error(message);
  return session;
}

/** Whether this role may write a page, without throwing — for rendering. */
export async function canWritePage(href: string): Promise<boolean> {
  const session = await auth();
  if (!session) return false;
  const permissions = await getSessionPermissions(session);
  return permissions.canWrite(resourceKey("page", href));
}
