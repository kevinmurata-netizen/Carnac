import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { getSessionPermissions, resourceKey } from "@/server/permissions";
import { listAssetTypeDetails } from "@/server/settings";
import { getPageName } from "@/server/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { AssetTypeList } from "./asset-type-list";
import {
  createAssetTypeAction,
  saveAssetTypeAction,
  createAttributeAction,
  saveAttributeAction,
  deleteAttributeAction,
  createTemplateAction,
  toggleTemplateActiveAction,
} from "../actions";

/**
 * The kinds of asset this utility holds, each with what it records and what is
 * inspected on it.
 *
 * Attributes used to live only under Administration → Fields, which lists the
 * waterline's and nothing else — so a reservoir's attributes could be seeded
 * but never seen, let alone added. They belong beside the type they describe:
 * a type with no attributes cannot hold data, and that is only obvious when
 * the two are read together.
 */
export default async function AssetTypesPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/asset-types", "Asset Types");
  const { canWrite: canEdit } = await requireCard("/settings/asset-types");

  // Inspection templates are a card of their own, so adding a form here is
  // governed by that card rather than by this one.
  const permissions = await getSessionPermissions(session!);
  const canEditTemplates = permissions.canWrite(resourceKey("card", "/settings/inspection-templates"));

  const types = await listAssetTypeDetails(organizationId);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Every kind of asset this utility holds, what each one records, and the forms used to inspect it"
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Asset types are read-only for your role.
        </div>
      )}

      <AssetTypeList
        types={types}
        canEdit={canEdit}
        canEditTemplates={canEditTemplates}
        onSaveType={saveAssetTypeAction}
        onCreateType={createAssetTypeAction}
        onCreateAttribute={createAttributeAction}
        onSaveAttribute={saveAttributeAction}
        onDeleteAttribute={deleteAttributeAction}
        onCreateTemplate={createTemplateAction}
        onToggleTemplate={toggleTemplateActiveAction}
      />

      <p className="mt-4 text-xs text-muted-foreground">
        Asset types are rows rather than tables, so a new one needs no schema change — but it also arrives with
        nothing attached. Condition, deterioration, risk and treatment models are configured per type under{" "}
        <Link href="/settings?tab=modeling" className="text-primary hover:underline">
          Settings → Modeling
        </Link>
        , and the questions on an inspection form under{" "}
        <Link href="/administration/fields" className="text-primary hover:underline">
          Administration → Fields
        </Link>
        .
      </p>
    </div>
  );
}
