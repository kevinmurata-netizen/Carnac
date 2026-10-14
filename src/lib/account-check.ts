import { prisma } from "@/lib/prisma";

/**
 * Whether a signed-in account may still use the application, and as what.
 *
 * Sessions are JWTs, so nothing about one changes after sign-in unless
 * something re-reads the database. Without this, deactivating or deleting a
 * user left their session working until it expired (30 days), and a role
 * change only reached them when they next signed in.
 *
 * The answer is held per server process for RECHECK_MS rather than read on
 * every call. A page calls auth() several times — the layout, its metadata,
 * the page, the guard — and every navigation does it again, so an uncached
 * check would be several queries per click for something that changes a few
 * times a year. The cost is that a change made on a different server instance
 * can take up to RECHECK_MS to reach a session. Changes made through the
 * Administration screens clear the entry on the instance that made them, so
 * there (and always in local development, which is one process) it is
 * immediate.
 *
 * Node only: this reads the database, so it must never be imported by the
 * proxy, which builds its own Auth.js from the database-free auth.config.ts.
 */

export const RECHECK_MS = 60_000;

export type AccountClaims = {
  name: string;
  email: string;
  organizationId: string;
  roleId: string;
  roleName: string;
  roleCode: string;
  permissions: string[];
};

type Entry = { expires: number; claims: Promise<AccountClaims | null> };

// On globalThis for the same reason as the Prisma client: Next can load this
// module more than once (route handlers and server components are bundled
// separately), and a forget() that cleared only one copy would leave the other
// answering from a stale entry.
const globalForAccounts = globalThis as unknown as {
  accountChecks: Map<string, Entry> | undefined;
};
const entries = (globalForAccounts.accountChecks ??= new Map());

async function load(userId: string): Promise<AccountClaims | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user || !user.isActive) return null;

  return {
    name: user.name,
    email: user.email,
    organizationId: user.organizationId,
    roleId: user.roleId,
    roleName: user.role.name,
    roleCode: user.role.code,
    permissions: Array.isArray(user.role.permissions) ? (user.role.permissions as string[]) : [],
  };
}

/**
 * The account's current claims, or null when it no longer exists or has been
 * deactivated — which ends the session.
 *
 * The promise is what gets cached, not the result, so the handful of auth()
 * calls one page makes at the same moment share a single query instead of
 * each missing the cache together. A failed query is not cached: it throws,
 * Auth.js treats a throwing callback as no session, and the next request
 * tries again.
 */
export function currentAccount(userId: string): Promise<AccountClaims | null> {
  const now = Date.now();
  const cached = entries.get(userId);
  if (cached && cached.expires > now) return cached.claims;

  // Expired entries are dropped as they are found, which keeps the map to
  // roughly the people active in the last minute.
  for (const [id, entry] of entries) if (entry.expires <= now) entries.delete(id);

  const claims = load(userId);
  entries.set(userId, { expires: now + RECHECK_MS, claims });
  claims.catch(() => {
    if (entries.get(userId)?.claims === claims) entries.delete(userId);
  });
  return claims;
}

/**
 * Drop what this process remembers about an account, so the next request
 * re-reads it. With no id, forget everyone — for a change such as a role
 * rename that touches every holder of the role.
 */
export function forgetAccount(userId?: string) {
  if (userId) entries.delete(userId);
  else entries.clear();
}
