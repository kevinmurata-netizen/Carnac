import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getPageName } from "@/server/navigation";
import { getBranding } from "@/server/branding";
import { PageHeader } from "@/components/layout/page-header";
import { BrandingEditor } from "./branding-editor";

export default async function BrandingPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const { canWrite: canEdit } = await requireCard("/settings/branding");
  const [pageTitle, branding] = await Promise.all([
    getPageName(organizationId, "/settings/branding", "Branding"),
    getBranding(organizationId),
  ]);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="What the app calls itself and the things it manages — the same platform for water, power or anything else"
      />
      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Branding is read-only for your role.
        </div>
      )}
      <BrandingEditor branding={branding} canEdit={canEdit} />
    </div>
  );
}
