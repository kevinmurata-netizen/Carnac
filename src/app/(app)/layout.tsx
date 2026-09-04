import { auth } from "@/lib/auth";
import { getNavOverrides, getHiddenHrefs } from "@/server/navigation";
import { getPermissions, governedPages, resourceKey } from "@/server/permissions";
import { AppShell } from "@/components/layout/app-shell";
import { BreadcrumbProvider } from "@/components/layout/breadcrumbs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session!.user;

  // Loaded once here and shared with both the sidebar and the breadcrumb trail
  // so a renamed page reads the same in either place.
  const [overrides, hidden, permissions] = await Promise.all([
    getNavOverrides(user.organizationId),
    getHiddenHrefs(user.organizationId),
    getPermissions(user.organizationId, user.roleId),
  ]);

  const hiddenForRole = permissions.isAdministrator
    ? []
    : governedPages()
        .filter((p) => !permissions.isVisible(resourceKey("page", p.href)))
        .map((p) => p.href);

  // Either source can hide an entry and neither can force one back into view:
  // both are presentational, so the union is the honest answer. A page hidden
  // here still resolves — closing it is what a role's read permission does.
  const allHidden = [...new Set([...hidden, ...hiddenForRole])];

  return (
    <BreadcrumbProvider overrides={overrides}>
      <AppShell
        overrides={overrides}
        hidden={allHidden}
        userName={user.name ?? user.email ?? "User"}
        /* Read from the database rather than the session, so renaming a role
           shows up straight away instead of waiting for everyone to sign in
           again. */
        roleName={permissions.roleName}
      >
        {children}
      </AppShell>
    </BreadcrumbProvider>
  );
}
