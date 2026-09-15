import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireCard } from "@/server/guard";
import { listTreatmentsForAdmin } from "@/server/treatment-config";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { getPageName } from "@/server/navigation";
import { TreatmentLibrary } from "./treatment-library";

export default async function TreatmentsAdminPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/treatments", "Treatments");
  const { canWrite: canEdit } = await requireCard("/settings/treatments");

  const treatments = await listTreatmentsForAdmin(organizationId);
  const withRules = treatments.filter((t) => t.ruleCount > 0).length;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="The library that drives recommendations, life-cycle cost, work plans and scenarios"
        actions={
          canEdit && (
            // A page of its own rather than a blank form below the table: a
            // treatment needs prices and rules to be usable, and neither can
            // be filled in against a treatment that does not exist yet.
            <Button
              size="sm"
              nativeButton={false}
              render={
                <Link href="/settings/treatments/new">
                  <Plus className="mr-1 h-4 w-4" />
                  Add new Treatment
                </Link>
              }
            />
          )
        }
      />

      {!canEdit && (
        <div className="mb-4 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You are signed in as {session!.user.roleName}. Treatments are read-only for your role.
        </div>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>
            Library <span className="text-muted-foreground">({treatments.length})</span>
            {withRules > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · {withRules} with a rule
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TreatmentLibrary treatments={treatments} canEdit={canEdit} />
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Edits apply on the next recommendation, life-cycle comparison, work plan generation or scenario run — none of
        these are cached snapshots. Existing work plans keep whatever costs they were generated with until
        regenerated.
      </p>
    </div>
  );
}
