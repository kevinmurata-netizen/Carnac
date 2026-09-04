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

/**
 * Roles are identified by code, never by display name.
 *
 * The name is renameable, so keying anything on it would mean calling the
 * Administrator role something else silently removed everyone's admin access.
 * These codes are assigned once and never change.
 */
export const ADMINISTRATOR_CODE = "ADMINISTRATOR";

/** The role that has always been read-only, per docs/SPEC.md §34. */
export const READ_ONLY_CODE = "EXECUTIVE";

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

export function defaultAccessFor(resource: string, roleCode: string): ResourceAccess {
  if (resource.startsWith("page:")) {
    return { read: true, write: roleCode !== READ_ONLY_CODE, visible: true };
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
  roleCode: string;
  isAdministrator: boolean;
  access: (resource: string) => ResourceAccess;
  canRead: (resource: string) => boolean;
  canWrite: (resource: string) => boolean;
  isVisible: (resource: string) => boolean;
};

/**
 * Resolved from the role's id against the database, not from whatever the
 * session is carrying.
 *
 * A session's copy of the role name goes stale the moment a role is renamed,
 * and a stale name deciding who is an Administrator is exactly the bug the
 * code column exists to prevent. One extra lookup is worth not having to
 * reason about token freshness.
 */
export async function getPermissions(organizationId: string, roleId: string): Promise<PermissionSet> {
  const [role, overrides] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId }, select: { name: true, code: true } }),
    storedOverrides(organizationId, roleId),
  ]);

  // No role means no grounds to grant anything.
  const roleName = role?.name ?? "Unknown";
  const roleCode = role?.code ?? "";
  const isAdministrator = roleCode === ADMINISTRATOR_CODE;

  const access = (resource: string): ResourceAccess => {
    if (isAdministrator) return FULL;
    const stored = overrides.get(resource);
    if (!stored) return defaultAccessFor(resource, roleCode);
    // Write without read would be a contradiction the UI cannot express and
    // the server should not honour; read is the gate everything else sits
    // behind.
    if (!stored.read) return { read: false, write: false, visible: false };
    return stored;
  };

  return {
    roleName,
    roleCode,
    isAdministrator,
    access,
    canRead: (r) => access(r).read,
    canWrite: (r) => access(r).write,
    isVisible: (r) => access(r).visible && access(r).read,
  };
}

/** The set already resolved for the signed-in user. */
export async function getSessionPermissions(session: {
  user: { organizationId: string; roleId: string };
}): Promise<PermissionSet> {
  return getPermissions(session.user.organizationId, session.user.roleId);
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
  roleCode: string,
  navLabel: (href: string, fallback: string) => string
): Promise<RoleMatrix> {
  const isAdministrator = roleCode === ADMINISTRATOR_CODE;
  const [role, overrides] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId }, select: { name: true } }),
    storedOverrides(organizationId, roleId),
  ]);

  const resolve = (kind: ResourceKind, href: string, fallback: string): PermissionRow => {
    const resource = resourceKey(kind, href);
    return {
      resource,
      href,
      kind,
      label: navLabel(href, fallback),
      access: isAdministrator ? FULL : (overrides.get(resource) ?? defaultAccessFor(resource, roleCode)),
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

  return { roleId, roleName: role?.name ?? "Unknown", isAdministrator, sections };
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
  if (role.code === ADMINISTRATOR_CODE) {
    throw new Error(
      `${role.name} keeps full access — otherwise there would be no way back into this screen`
    );
  }

  const allowed = allResourceKeys();

  for (const input of inputs) {
    if (!allowed.has(input.resource)) continue;

    // Read is the gate; nothing survives losing it.
    const read = input.read;
    const write = read && input.write;
    const visible = read && input.visible;

    const fallback = defaultAccessFor(input.resource, role.code);
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

// ---------------------------------------------------------------------------
// Creating, renaming and removing roles
// ---------------------------------------------------------------------------

/** Reserved for the seeded roles, so a custom role can never claim a code the
 * application reasons about. */
const RESERVED_CODES = new Set([ADMINISTRATOR_CODE, READ_ONLY_CODE, "ASSET_MANAGER", "INSPECTOR"]);

function validateRoleName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("A role needs a name");
  if (trimmed.length > 40) throw new Error("Keep role names under 40 characters");
  return trimmed;
}

/**
 * Rejects a name already in use, ignoring case.
 *
 * The unique index on `name` is case-sensitive, so "field supervisor" and
 * "Field Supervisor" would both be accepted and then sit in the list looking
 * like the same role twice. Two roles a person cannot tell apart is a worse
 * outcome than a rejected name.
 */
async function assertNameFree(name: string, exceptRoleId?: string) {
  const clash = await prisma.role.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptRoleId ? { id: { not: exceptRoleId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new Error(`There is already a role called "${clash.name}"`);
}

/**
 * A stable code derived from the name it was created with.
 *
 * Derived once and then never touched again — renaming the role later does not
 * change it, which is the whole point. A numeric suffix settles collisions so
 * two roles named similarly still get distinct codes.
 */
async function codeForNewRole(name: string): Promise<string> {
  const base =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "ROLE";

  const taken = new Set((await prisma.role.findMany({ select: { code: true } })).map((r) => r.code));
  let candidate = `CUSTOM_${base}`;
  let n = 2;
  while (taken.has(candidate) || RESERVED_CODES.has(candidate)) {
    candidate = `CUSTOM_${base}_${n++}`;
  }
  return candidate;
}

export type CreateRoleInput = {
  name: string;
  /** Start from another role's permissions rather than the defaults. */
  copyFromRoleId?: string;
};

export async function createRole(organizationId: string, input: CreateRoleInput) {
  const name = validateRoleName(input.name);
  await assertNameFree(name);

  // Everything that can refuse the request is checked before anything is
  // written. Validating the copy source after creating the role would leave an
  // orphan behind every time a copy was refused.
  let source: { id: string; code: string; name: string } | null = null;
  if (input.copyFromRoleId) {
    source = await prisma.role.findUnique({
      where: { id: input.copyFromRoleId },
      select: { id: true, code: true, name: true },
    });
    if (!source) throw new Error("The role to copy from no longer exists");

    // Copying an Administrator would be copying "no stored rows", which reads
    // as the defaults rather than as full access — misleading enough to refuse.
    if (source.code === ADMINISTRATOR_CODE) {
      throw new Error(
        `${source.name} has full access by definition rather than stored permissions, so there is nothing to copy. Create the role and grant what it needs.`
      );
    }
  }

  const sourceRows = source
    ? await prisma.rolePermission.findMany({ where: { organizationId, roleId: source.id } })
    : [];

  const code = await codeForNewRole(name);

  // One transaction, so a role never exists without the permissions that were
  // meant to come with it.
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({
      data: {
        name,
        code,
        // The legacy string list stays empty: it is descriptive only, and what
        // this role can actually reach lives in role_permissions.
        permissions: [],
        isSystem: false,
      },
    });

    if (!source) return role;

    const rows = sourceRows.map((r) => ({
      organizationId,
      roleId: role.id,
      resource: r.resource,
      canRead: r.canRead,
      canWrite: r.canWrite,
      visible: r.visible,
    }));

    // Stored rows are only the deviations, so anything the source left at its
    // own default has to be written out explicitly where the new role's
    // default differs — otherwise "a copy of Executive" would silently gain
    // write on every page, since the new role is not itself an Executive.
    const stored = new Set(sourceRows.map((r) => r.resource));
    for (const resource of allResourceKeys()) {
      if (stored.has(resource)) continue;
      const theirs = defaultAccessFor(resource, source.code);
      const mine = defaultAccessFor(resource, code);
      if (theirs.read === mine.read && theirs.write === mine.write && theirs.visible === mine.visible) continue;
      rows.push({
        organizationId,
        roleId: role.id,
        resource,
        canRead: theirs.read,
        canWrite: theirs.write,
        visible: theirs.visible,
      });
    }

    if (rows.length > 0) await tx.rolePermission.createMany({ data: rows });
    return role;
  });
}

export async function renameRole(roleId: string, name: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new Error("Role not found");

  const next = validateRoleName(name);
  if (next === role.name) return role;

  // Excluding itself, so changing only the capitalisation of a role's own name
  // is allowed rather than colliding with itself.
  await assertNameFree(next, roleId);

  // Renaming any role, including Administrator, is safe: nothing in the
  // application reads the name to decide what a role may do.
  return prisma.role.update({ where: { id: roleId }, data: { name: next } });
}

export async function deleteRole(organizationId: string, roleId: string) {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw new Error("Role not found");

  if (role.isSystem) {
    throw new Error(`${role.name} is one of the built-in roles and cannot be deleted, only renamed`);
  }
  if (role._count.users > 0) {
    throw new Error(
      `${role.name} still has ${role._count.users} ${role._count.users === 1 ? "person" : "people"} assigned. Move them to another role first.`
    );
  }

  // Its permission rows go with it — they describe this role and nothing else.
  await prisma.rolePermission.deleteMany({ where: { organizationId, roleId } });
  await prisma.role.delete({ where: { id: roleId } });
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
export async function hiddenHrefsForRole(organizationId: string, roleId: string): Promise<string[]> {
  const permissions = await getPermissions(organizationId, roleId);
  if (permissions.isAdministrator) return [];
  return governedPages()
    .filter((p) => !permissions.isVisible(resourceKey("page", p.href)))
    .map((p) => p.href);
}
