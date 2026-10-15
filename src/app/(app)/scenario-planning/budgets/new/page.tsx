import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetEditor } from "../budget-editor";
import { saveBudgetPlanAction } from "../actions";
import { listModelledAssetTypes } from "@/server/modelled-asset-type";

export default async function NewBudgetPage() {
  const session = await auth();
  if (!canRecordFieldData(session)) redirect("/scenario-planning/budgets");
  const assetTypes = await listModelledAssetTypes(session!.user.organizationId);

  return (
    <div>
      <PageHeader title="New Budget" description="Enter the money year by year, then choose this budget on a scenario" />
      <Card>
        <CardContent className="pt-6">
          <BudgetEditor
            action={saveBudgetPlanAction}
            initial={{ id: "", name: "", description: "", lines: [] }}
            assetTypes={assetTypes}
          />
        </CardContent>
      </Card>
    </div>
  );
}
