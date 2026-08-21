import { auth } from "@/lib/auth";
import { listInspectionFields, listInventoryFields } from "@/server/field-config";
import { ASSET_LABEL } from "@/config/labels";
import { PageHeader } from "@/components/layout/page-header";
import { InspectionFieldsEditor, InventoryFieldsEditor } from "./fields-editor";
import { getPageName } from "@/server/navigation";

export default async function FieldsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/administration/fields", "Fields");
  const isAdmin = session!.user.roleName === "Administrator";

  const [inspectionFields, inventoryFields] = await Promise.all([
    listInspectionFields(organizationId),
    listInventoryFields(organizationId),
  ]);

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`What inspectors are asked, and what the ${ASSET_LABEL.lower} inventory records`}
      />

      {!isAdmin && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Field definitions are read-only for your role.
        </div>
      )}

      <div className="space-y-4">
        <InspectionFieldsEditor fields={inspectionFields} canEdit={isAdmin} />
        <InventoryFieldsEditor fields={inventoryFields} canEdit={isAdmin} />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        A definition that already holds recorded data cannot be deleted — the guard reports how much data depends on
        it rather than silently discarding field observations. To retire a scoring component without losing its
        history, remove it from the Condition Index instead; the field and its answers stay put.
      </p>
    </div>
  );
}
