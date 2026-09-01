import { auth } from "@/lib/auth";
import { getNavOverrides, getHiddenHrefs } from "@/server/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { BreadcrumbProvider } from "@/components/layout/breadcrumbs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session!.user;

  // Loaded once here and shared with both the sidebar and the breadcrumb trail
  // so a renamed page reads the same in either place.
  const [overrides, hidden] = await Promise.all([
    getNavOverrides(user.organizationId),
    getHiddenHrefs(user.organizationId),
  ]);

  return (
    <BreadcrumbProvider overrides={overrides}>
      <AppShell
        overrides={overrides}
        hidden={[...hidden]}
        userName={user.name ?? user.email ?? "User"}
        roleName={user.roleName}
      >
        {children}
      </AppShell>
    </BreadcrumbProvider>
  );
}
