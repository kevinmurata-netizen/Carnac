import { prisma } from "@/lib/prisma";

/**
 * The four roles every deployment starts with. They can be renamed but not
 * deleted — an organization with no Administrator role has no way back in.
 * Roles are shared by every organization on a site; the code identifies each
 * for anything the app decides, the name is only what it is called.
 */
export const SYSTEM_ROLES = [
  { code: "ADMINISTRATOR", name: "Administrator", permissions: ["*"] },
  {
    code: "ASSET_MANAGER",
    name: "Asset Manager",
    permissions: [
      "assets:read",
      "assets:write",
      "inspections:write",
      "models:write",
      "treatments:write",
      "scenarios:write",
      "work-plans:write",
    ],
  },
  { code: "INSPECTOR", name: "Inspector", permissions: ["assets:read", "inspections:read", "inspections:write"] },
  {
    code: "EXECUTIVE",
    name: "Executive",
    permissions: ["assets:read", "dashboards:read", "reports:read", "scenarios:read", "work-plans:read"],
  },
] as const;

export type SystemRoleCode = (typeof SYSTEM_ROLES)[number]["code"];

/**
 * Creates whichever system roles are missing, by code, and leaves existing
 * ones — renamed or with edited permissions — as they are. Returns each
 * role's id by code.
 */
export async function ensureSystemRoles(): Promise<Record<SystemRoleCode, string>> {
  const ids = {} as Record<SystemRoleCode, string>;
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findUnique({ where: { code: role.code }, select: { id: true } });
    const row =
      existing ??
      (await prisma.role.create({
        data: { code: role.code, name: role.name, isSystem: true, permissions: [...role.permissions] },
        select: { id: true },
      }));
    ids[role.code] = row.id;
  }
  return ids;
}
