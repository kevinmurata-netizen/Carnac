import Link from "next/link";
import { auth } from "@/lib/auth";
import { canRecordFieldData } from "@/lib/permissions";
import { listScenarioSets } from "@/server/scenario-sets";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { ScenarioSetList } from "./scenario-set-list";

export default async function ScenarioSetsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const sets = await listScenarioSets(organizationId);
  const canEdit = canRecordFieldData(session);

  return (
    <div>
      <PageHeader
        title="Scenario Sets"
        description="Scenarios grouped to be compared over one planning window — every scenario in a set runs from its base year for its planning period"
        actions={
          canEdit && (
            <Button
              size="sm"
              nativeButton={false}
              render={
                <Link href="/scenario-planning/sets/new">
                  <Plus className="mr-1 h-4 w-4" />
                  New Scenario Set
                </Link>
              }
            />
          )
        }
      />

      <Card>
        <CardContent className="pt-2">
          <ScenarioSetList
            sets={sets}
            emptyText={
              <>
                No scenario sets yet. A set holds scenarios meant to be compared, and makes sure they cover the same
                years.
              </>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
