import { auth } from "@/lib/auth";
import { getNavOverrides } from "@/server/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { BreadcrumbProvider } from "@/components/layout/breadcrumbs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session!.user;

  // Loaded once here and shared with both the sidebar and the breadcrumb trail
  // so a renamed page reads the same in either place.
  const overrides = await getNavOverrides(user.organizationId);

  return (
    <BreadcrumbProvider overrides={overrides}>
      <AppShell
        overrides={overrides}
        userName={user.name ?? user.email ?? "User"}
        roleName={user.roleName}
      >
        {children}
      </AppShell>
    </BreadcrumbProvider>
  );
}
