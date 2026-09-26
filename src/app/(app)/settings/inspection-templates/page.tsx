import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listInspectionTemplateDetails } from "@/server/settings";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActiveToggle } from "@/components/settings/active-toggle";
import { TemplateEditor } from "./template-editor";
import { toggleTemplateActiveAction } from "../actions";
import { formatNumber } from "@/lib/format";

/**
 * The forms used in the field.
 *
 * Split from the old Configuration page, which held asset types and these
 * together: they are different jobs done by different people, and the one
 * screen meant scrolling past every asset type to reach a form. A template is
 * still shown with the type it belongs to, because a form for a reservoir and
 * a form for a pipe are not interchangeable — adding one is done on the type
 * itself, under Asset Types.
 */
export default async function InspectionTemplatesPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/inspection-templates", "Inspection Templates");
  const { canWrite: canEdit } = await requireCard("/settings/inspection-templates");

  const templates = await listInspectionTemplateDetails(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="The forms inspectors fill in, and which kind of asset each one is for"
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Inspection templates are read-only for your role.
        </div>
      )}

      <div className="space-y-4">
        {templates.length === 0 && (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            No inspection forms yet. A form belongs to one kind of asset, so it is added from that type under{" "}
            <Link href="/settings/asset-types" className="text-primary hover:underline">
              Asset Types
            </Link>
            .
          </div>
        )}

        {templates.map((template) =>
          canEdit ? (
            <TemplateEditor key={template.id} template={template} assetTypeName={template.assetTypeName} />
          ) : (
            <Card key={template.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
                <span className="font-medium text-foreground">{template.name}</span>
                <Badge variant="outline">{template.assetTypeName}</Badge>
                <ActiveToggle
                  id={template.id}
                  isActive={template.isActive}
                  action={toggleTemplateActiveAction}
                  readOnly
                />
                <span className="text-xs text-muted-foreground">
                  {formatNumber(template.fieldCount)} questions · {formatNumber(template.inspectionCount)}{" "}
                  inspections
                </span>
              </CardContent>
            </Card>
          )
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        A new form is added from the asset type it is for, under{" "}
        <Link href="/settings/asset-types" className="text-primary hover:underline">
          Asset Types
        </Link>
        . The questions on a form are edited under{" "}
        <Link href="/administration/fields" className="text-primary hover:underline">
          Administration → Fields
        </Link>
        .
      </p>
    </div>
  );
}
