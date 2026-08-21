import { auth } from "@/lib/auth";
import { listRenameablePages, getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NavigationEditor } from "./editor";

export default async function NavigationSettingsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const isAdmin = session!.user.roleName === "Administrator";

  const [sections, title] = await Promise.all([
    listRenameablePages(organizationId),
    getPageName(organizationId, "/settings/navigation", "Navigation"),
  ]);

  const renamed = sections.flatMap((s) => s.items).filter((i) => i.renamed);

  return (
    <div>
      <PageHeader
        title={title}
        description="Rename any page — the sidebar, breadcrumbs and page heading all follow"
      />

      {isAdmin ? (
        <NavigationEditor sections={sections} />
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            You are signed in as {session!.user.roleName}. Page names are read-only for your role.
          </div>
          <Card>
            <CardContent className="space-y-2 py-6 text-sm">
              {renamed.length === 0 ? (
                <span className="text-muted-foreground">Every page uses its default name.</span>
              ) : (
                renamed.map((i) => (
                  <div key={i.href} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{i.label}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      was {i.defaultLabel}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{i.href}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
