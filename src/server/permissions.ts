import { prisma } from "@/lib/prisma";
import { NAV_GROUPS } from "@/config/nav";
import { groupKey } from "@/config/nav-groups";
import { SETTINGS_CARDS, SETTINGS_TABS } from "@/config/settings-cards";

/**
 * What a role may do with each page and Settings card.
 *
 * Three independent flags, because they answer three different questions:
 *
 *   read    — may this role open the page at all? This is the access control.
 *   write   — may it change anything there? Enforced in the server actions,
 *             not merely by hiding buttons.
 *   visible — does the entry appear in the sidebar or the Settings grid? This
 *             is tidying, not security: a hidden page still resolves, so a
 *             bookmark or a link from elsewhere keeps working. It matches what
 *             the existing organization-wide nav hiding already means.
 *
 * Administrator is deliberately not configurable. Someone has to be able to
 * undo a mistake, and a UI that lets you remove your own access to the screen
 * that grants access is a trap rather than a feature.
 */

export type ResourceAccess = { read: boolean; write: boolean; visible: boolean };

export const ADMINISTRATOR = "Administrator";

/** Full access, the Administrator's fixed answer for every resource. */
const FULL: ResourceAccess = { read: true, write: true, visible: true };

/**
 * What a resource means with no row stored for it.
 *
 * The rule is "whatever the application did before this table existed", so an
 * unconfigured organization behaves identically to how it did before and a
 * resource added in code is reachable rather than accidentally sealed off
 * because nobody remembered to insert rows for it.
 *
 * That default is not the same for both kinds, because the old behaviour was
 * not the same:
 *
 *   cards — settings were Administrator-only to change, so write starts false.
 *   pages — operational screens followed lib/permissions.ts's rule that
 *           everyone except Executive may record field data. Starting these
 *           at false instead would silently take inspections away from every
 *           Inspector the moment this shipped.
 *
 * Read and visible start true either way: nothing was hidden before.
 */
export const DEFAULT_ACCESS: ResourceAccess = { read: true, write: false, visible: true };

/** The role that has always been read-only, per docs/SPEC.md §34. */
const READ_ONLY_ROLE = "Executive";

export function defaultAccessFor(resource: string, roleName: string): ResourceAccess {
  if (resource.startsWith("page:")) {
    return { read: true, write: roleName !== READ_ONLY_ROLE, visible: true };
  }
  return DEFAULT_ACCESS;
}

export type ResourceKind = "page" | "card";

export function resourceKey(kind: ResourceKind, href: string): string {
  return `${kind}:${href}`;
}

/** The pages that can be governed: the sidebar's own entries. Settings
 * sub-pages are governed by their card instead — see config/settings-cards.ts. */
export function governedPages(): Array<{ href: string; label: string; group: string }> {
  return NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label, group: g.label })));
}

/** Every resource key this module will accept, so a crafted form cannot write
 * permissions for a path that does not exist. */
export function allResourceKeys(): Set<string> {
  return new Set([
    ...governedPages().map((p) => resourceKey("page", p.href)),
    ...SETTINGS_CARDS.map((c) => resourceKey("card", c.href)),
  ]);
}

/**
 * One role's stored overrides, keyed by resource.
 *
 * Returns only what is stored; callers resolve misses through DEFAULT_ACCESS
 * (or accessFor below) rather than this map pretending to be complete.
 */
async function storedOverrides(organizationId: string, roleId: string): Promise<Map<string, ResourceAccess>> {
  const rows = await prisma.rolePermission.findMany({
    where: { organizationId, roleId },
    select: { resource: true, canRead: true, canWrite: true, visible: true },
  });
  return new Map(rows.map((r) => [r.resource, { read: r.canRead, write: r.canWrite, visible: r.visible }]));
}

/**
 * Everything one role may do, ready to ask questions of.
 *
 * `roleName` decides the Administrator bypass; it is read from the session
 * rather than trusted from a form.
 */
export type PermissionSet = {
  roleName: string;
  isAdministrator: boolean;
  access: (resource: string) => ResourceAccess;
  canRead: (resource: string) => boolean;
  canWrite: (resource: string) => boolean;
  isVisible: (resource: string) => boolean;
};

export async function getPermissions(
  organizationId: string,
  roleId: string,
  roleName: string
): Promise<PermissionSet> {
  const isAdministrator = roleName === ADMINISTRATOR;
  const overrides = isAdministrator ? new Map<string, ResourceAccess>() : await storedOverrides(organizationId, roleId);

  const access = (resource: string): ResourceAccess => {
    if (isAdministrator) return FULL;
    const stored = overrides.get(resource);
    if (!stored) return defaultAccessFor(resource, roleName);
    // Write without read would be a contradiction the UI cannot express and
    // the server should not honour; read is the gate everything else sits
    // behind.
    if (!stored.read) return { read: false, write: false, visible: false };
    return stored;
  };

  return {
    roleName,
    isAdministrator,
    access,
    canRead: (r) => access(r).read,
    canWrite: (r) => access(r).write,
    isVisible: (r) => access(r).visible && access(r).read,
  };
}

/** The set already resolved for the signed-in user. */
export async function getSessionPermissions(session: {
  user: { organizationId: string; roleId: string; roleName: string };
}): Promise<PermissionSet> {
  return getPermissions(session.user.organizationId, session.user.roleId, session.user.roleName);
}

// ---------------------------------------------------------------------------
// The matrix behind the Roles screen
// ---------------------------------------------------------------------------

export type PermissionRow = {
  resource: string;
  label: string;
  href: string;
  kind: ResourceKind;
  access: ResourceAccess;
  /** True where the row is fixed and the UI should say so rather than offering
   * a control that will not take. */
  locked: boolean;
};

export type PermissionSection = { group: string; rows: PermissionRow[] };

export type RoleMatrix = {
  roleId: string;
  roleName: string;
  isAdministrator: boolean;
  sections: PermissionSection[];
};

/**
 * The full grid for one role: every governed resource, with what is stored (or
 * the default where nothing is).
 *
 * Names come from the same per-organization overrides the sidebar uses, so a
 * renamed page is called the same thing here as everywhere else — otherwise
 * this screen would be the one place still using the name in code.
 */
export async function getRoleMatrix(
  organizationId: string,
  roleId: string,
  roleName: string,
  navLabel: (href: string, fallback: string) => string
): Promise<RoleMatrix> {
  const isAdministrator = roleName === ADMINISTRATOR;
  const overrides = await storedOverrides(organizationId, roleId);

  const resolve = (kind: ResourceKind, href: string, fallback: string): PermissionRow => {
    const resource = resourceKey(kind, href);
    return {
      resource,
      href,
      kind,
      label: navLabel(href, fallback),
      access: isAdministrator ? FULL : (overrides.get(resource) ?? defaultAccessFor(resource, roleName)),
      locked: isAdministrator,
    };
  };

  const sections: PermissionSection[] = NAV_GROUPS.map((g) => ({
    group: navLabel(groupKey(g.label), g.label),
    rows: g.items.map((i) => resolve("page", i.href, i.label)),
  }));

  for (const tab of SETTINGS_TABS) {
    const cards = SETTINGS_CARDS.filter((c) => c.tab === tab.key);
    if (cards.length === 0) continue;
    sections.push({
      group: `Settings — ${tab.label}`,
      rows: cards.map((c) => resolve("card", c.href, c.title)),
    });
  }

  return { roleId, roleName, isAdministrator, sections };
}

export type PermissionInput = { resource: string; read: boolean; write: boolean; visible: boolean };

/**
 * Replaces one role's permissions with the given set.
 *
 * Rows matching the default are deleted rather than stored, so the table holds
 * only genuine deviations — the same rule navigation_labels follows, and it
 * means a resource keeps following the code default if that ever changes.
 */
export async function setRolePermissions(
  organizationId: string,
  roleId: string,
  inputs: PermissionInput[]
): Promise<void> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new Error("Role not found");
  if (role.name === ADMINISTRATOR) {
    throw new Error("Administrator keeps full access — otherwise there would be no way back into this screen");
  }

  const allowed = allResourceKeys();

  for (const input of inputs) {
    if (!allowed.has(input.resource)) continue;

    // Read is the gate; nothing survives losing it.
    const read = input.read;
    const write = read && input.write;
    const visible = read && input.visible;

    const fallback = defaultAccessFor(input.resource, role.name);
    const isDefault = read === fallback.read && write === fallback.write && visible === fallback.visible;

    if (isDefault) {
      await prisma.rolePermission.deleteMany({
        where: { organizationId, roleId, resource: input.resource },
      });
      continue;
    }

    await prisma.rolePermission.upsert({
      where: { organizationId_roleId_resource: { organizationId, roleId, resource: input.resource } },
      create: { organizationId, roleId, resource: input.resource, canRead: read, canWrite: write, visible },
      update: { canRead: read, canWrite: write, visible },
    });
  }
}

/** Drops every override for a role, returning it to the defaults. */
export async function resetRolePermissions(organizationId: string, roleId: string): Promise<void> {
  await prisma.rolePermission.deleteMany({ where: { organizationId, roleId } });
}

/** How many resources a role has moved off the default, for a summary line. */
export async function countOverrides(organizationId: string): Promise<Map<string, number>> {
  const rows = await prisma.rolePermission.groupBy({
    by: ["roleId"],
    where: { organizationId },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.roleId, r._count._all]));
}

/**
 * Hrefs this role should not see in the sidebar.
 *
 * Merged with the organization-wide hidden set in the app layout: a page is
 * hidden if either says so, since both are presentational and neither should
 * be able to override the other into showing something someone hid.
 */
export async function hiddenHrefsForRole(organizationId: string, roleId: string, roleName: string): Promise<string[]> {
  if (roleName === ADMINISTRATOR) return [];
  const permissions = await getPermissions(organizationId, roleId, roleName);
  return governedPages()
    .filter((p) => !permissions.isVisible(resourceKey("page", p.href)))
    .map((p) => p.href);
}
