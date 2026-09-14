import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { DEFAULT_ASSUMPTIONS } from "@/domain/waterline/scenario";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ScenarioSetForm } from "../set-form";
import { createScenarioSetAction } from "../actions";

export default async function NewScenarioSetPage() {
  const session = await auth();
  if (!canRecordFieldData(session)) redirect("/scenario-planning/sets");

  return (
    <div>
      <PageHeader
        title="New Scenario Set"
        description="Name the decision, set the window — then add the scenarios that answer it"
      />
      <Card>
        <CardContent className="pt-6">
          <ScenarioSetForm
            action={createScenarioSetAction}
            onCancelHref="/scenario-planning/sets"
            initial={{
              id: "",
              name: "",
              description: "",
              // This year, which is where a scenario outside any set starts —
              // so moving existing scenarios into a new set changes nothing
              // until someone decides the window should be different.
              baseYear: String(new Date().getFullYear()),
              planningPeriodYears: String(DEFAULT_ASSUMPTIONS.analysisPeriodYears),
              status: "DRAFT",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
