import { auth } from "@/lib/auth";
import { getNavOverrides } from "@/server/navigation";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { BreadcrumbProvider, Breadcrumbs } from "@/components/layout/breadcrumbs";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session!.user;

  // Loaded once here and shared with both the sidebar and the breadcrumb trail
  // so a renamed page reads the same in either place.
  const overrides = await getNavOverrides(user.organizationId);

  return (
    <BreadcrumbProvider overrides={overrides}>
      <div className="flex min-h-screen w-full">
        <SidebarNav overrides={overrides} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-card px-6">
            <Breadcrumbs />
            <UserMenu name={user.name ?? user.email ?? "User"} roleName={user.roleName} />
          </header>
          <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
