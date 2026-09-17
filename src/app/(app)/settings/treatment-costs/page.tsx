import { auth } from "@/lib/auth";
import { requireCard, canWriteCard } from "@/server/guard";
import { listAllCostRates } from "@/server/cost-rates";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPageName } from "@/server/navigation";
import { CostRatesTable } from "./cost-rates-table";

/**
 * Every price in the library on one screen.
 *
 * Rates belong to the treatment they price, because a price is meaningless
 * without the work it pays for. This is the other view of the same data: the
 * one that makes an annual rate review a single pass rather than thirteen
 * visits — and a treatment's prices open in a pop-up here, so the review never
 * has to leave the page.
 */
export default async function TreatmentCostsPage() {
  const session = await auth();
  const organizationId = session!.user.organizationId;
  const pageTitle = await getPageName(organizationId, "/settings/treatment-costs", "Treatment Costs");
  await requireCard("/settings/treatment-costs");

  const [rates, canEdit, canEditRules] = await Promise.all([
    listAllCostRates(organizationId),
    // Prices are saved on the treatment, so changing them is the treatment
    // library's permission rather than this card's.
    canWriteCard("/settings/treatments"),
    canWriteCard("/settings/treatment-rules"),
  ]);

  const treatmentCount = new Set(rates.map((r) => r.treatmentId)).size;
  const ruleSelected = rates.filter((r) => r.ruleName).length;

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description={`What each treatment costs, and the rule that picks each price. ${
          canEdit ? "Click a treatment to change its prices." : "Changed on the treatment itself."
        }`}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Rates <span className="text-muted-foreground">({rates.length})</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              across {treatmentCount} treatment{treatmentCount === 1 ? "" : "s"}
              {ruleSelected > 0 ? ` · ${ruleSelected} selected by a rule` : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rates.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              No rates yet. A treatment with no rate cannot be priced, so it is never recommended.
            </p>
          ) : (
            <CostRatesTable rates={rates} canEdit={canEdit} canEditRules={canEditRules} />
          )}
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Rates are tried top to bottom within a treatment and the first whose rule matches is charged, so the order
        shown here is the order the model uses.
      </p>
    </div>
  );
}
