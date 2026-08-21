import Link from "next/link";
import { auth } from "@/lib/auth";
import { getConfigurationSettings } from "@/server/settings";
import { ASSET_LABEL } from "@/config/labels";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AssetTypeEditor, TemplateEditor, NewAssetTypeForm } from "./editor";
import { formatNumber } from "@/lib/format";
import { getPageName } from "@/server/navigation";

export default async function ConfigurationPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/configuration", "Configuration");
  const isAdmin = session!.user.roleName === "Administrator";

  const config = await getConfigurationSettings(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`${ASSET_LABEL.singular} classes, inventory attributes and the inspection forms used in the field`}
      />

      {!isAdmin && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Configuration is read-only for your role.
        </div>
      )}

      <h2 className="mb-2 text-sm font-medium text-foreground">
        {ASSET_LABEL.singular} Types <span className="text-muted-foreground">({config.assetTypes.length})</span>
      </h2>
      <div className="space-y-4">
        {config.assetTypes.map((t) =>
          isAdmin ? (
            <AssetTypeEditor key={t.id} assetType={t} />
          ) : (
            <Card key={t.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
                <span className="font-medium text-foreground">{t.name}</span>
                <Badge variant="secondary" className="font-mono">
                  {t.code}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatNumber(t.assetCount)} records</span>
              </CardContent>
            </Card>
          )
        )}
      </div>
      {isAdmin && <NewAssetTypeForm />}

      <h2 className="mb-2 mt-6 text-sm font-medium text-foreground">
        Inspection Templates <span className="text-muted-foreground">({config.templates.length})</span>
      </h2>
      <div className="space-y-4">
        {config.templates.map((t) =>
          isAdmin ? (
            <TemplateEditor key={t.id} template={t} />
          ) : (
            <Card key={t.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
                <span className="font-medium text-foreground">{t.name}</span>
                <Badge variant={t.isActive ? "default" : "secondary"}>{t.isActive ? "Active" : "Inactive"}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatNumber(t.fieldCount)} fields · {formatNumber(t.inspectionCount)} inspections
                </span>
              </CardContent>
            </Card>
          )
        )}
      </div>

      <Card className="mt-6">
        <CardContent className="py-4 text-sm">
          <div className="font-medium text-foreground">Attributes</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatNumber(config.attributeCount)} inventory attributes are defined. Attributes and inspection
            questions are field definitions rather than modelling configuration, so they are edited under{" "}
            <Link href="/administration/fields" className="text-primary hover:underline">
              Administration → Fields
            </Link>
            , alongside the data that populates them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
