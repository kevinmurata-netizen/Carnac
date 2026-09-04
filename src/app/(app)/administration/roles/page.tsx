import Link from "next/link";
import { auth } from "@/lib/auth";
import { listRoles } from "@/server/admin";
import { getNavOverrides, getPageName } from "@/server/navigation";
import { ADMINISTRATOR, countOverrides, getRoleMatrix } from "@/server/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { PermissionMatrix } from "./permission-matrix";
import { saveRolePermissionsAction, resetRolePermissionsAction } from "./actions";

/**
 * Roles, and exactly what each one may reach.
 *
 * Split out of the Users page: managing people and defining what a role can do
 * are different jobs done at different times, and putting the permission grid
 * under the user list buried it.
 */
export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role: requested } = await searchParams;
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const isAdmin = session!.user.roleName === ADMINISTRATOR;

  const [roles, overrides, counts, title] = await Promise.all([
    listRoles(),
    getNavOverrides(organizationId),
    countOverrides(organizationId),
    getPageName(organizationId, "/administration/roles", "Roles & Permissions"),
  ]);

  const selected = roles.find((r) => r.id === requested) ?? roles.find((r) => r.name !== ADMINISTRATOR) ?? roles[0];

  // The same names the sidebar and breadcrumbs use, so a renamed page is not
  // called something different on the one screen that grants access to it.
  const navLabel = (href: string, fallback: string) => overrides[href] ?? fallback;

  const matrix = selected
    ? await getRoleMatrix(organizationId, selected.id, selected.name, navLabel)
    : null;

  return (
    <div>
      <PageHeader
        title={title}
        description="What each role can open, change, and see in the navigation — page by page and card by card"
      />

      {!isAdmin && (
        <Card className="mb-4 border-dashed bg-muted/40">
          <CardContent className="py-3 text-sm text-muted-foreground">
            You are signed in as {session!.user.roleName}. Only an Administrator can change permissions; below is what
            each role is currently allowed.
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        {roles.map((r) => {
          const active = r.id === selected?.id;
          const changed = counts.get(r.id) ?? 0;
          return (
            <Link
              key={r.id}
              href={`/administration/roles?role=${r.id}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-transparent bg-primary font-medium text-primary-foreground"
                  : "text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {r.name}
              <span className="ml-1.5 opacity-70">{formatNumber(r.userCount)}</span>
              {r.name === ADMINISTRATOR ? (
                <span className="ml-1.5 opacity-70">· full</span>
              ) : changed > 0 ? (
                <span className="ml-1.5 opacity-70">· {changed} changed</span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {matrix && (
        <>
          {!isAdmin ? (
            <ReadOnlyMatrix matrix={matrix} />
          ) : (
            <PermissionMatrix
              roleId={matrix.roleId}
              roleName={matrix.roleName}
              isAdministrator={matrix.isAdministrator}
              sections={matrix.sections}
              save={saveRolePermissionsAction}
              reset={resetRolePermissionsAction}
            />
          )}
        </>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        A resource left at the default — readable and visible to everyone, writable only by an Administrator — is
        stored as no row at all, so a page added later follows the code default rather than being sealed off because
        nobody remembered to grant it.
      </p>
    </div>
  );
}

/** What a non-Administrator sees: the same grid, as facts rather than controls. */
function ReadOnlyMatrix({
  matrix,
}: {
  matrix: Awaited<ReturnType<typeof getRoleMatrix>>;
}) {
  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        {matrix.sections.map((section) => (
          <div key={section.group}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {section.group}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {section.rows.map((row) => (
                <Badge key={row.resource} variant="secondary" className="font-normal">
                  {row.label}
                  <span className="ml-1.5 opacity-70">
                    {!row.access.read
                      ? "no access"
                      : [row.access.write ? "write" : "read", row.access.visible ? null : "hidden"]
                          .filter(Boolean)
                          .join(", ")}
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
