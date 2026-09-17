"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import type { RuleSummary } from "@/server/rules";
import { CostEditor } from "../treatments/[id]/cost-editor";
import { openTreatmentCostsAction, setTreatmentCostsAction } from "../treatments/[id]/actions";

export type CostRateListRow = {
  id: string;
  treatmentId: string;
  treatmentName: string;
  name: string;
  ruleName: string | null;
  unitCost: number;
  costUnit: string;
  mobilizationCost: number;
  annualMaintenanceCost: number;
};

/**
 * Every rate, grouped by treatment, with a treatment's prices opening in a
 * pop-up.
 *
 * A treatment's prices are one ordered list that belongs to it, so the pop-up
 * holds exactly the "What it costs" editor from the treatment's own page — the
 * same rows, order and fallback checks — without leaving this review screen.
 *
 * A role that can read prices but not change treatments gets a link instead,
 * landing on the What it costs section rather than the top of the treatment.
 */
export function CostRatesTable({
  rates,
  canEdit,
  canEditRules,
}: {
  rates: CostRateListRow[];
  /** Whether this role may change treatments, which is where prices are saved. */
  canEdit: boolean;
  canEditRules: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Bumped per opening, so each opening fetches fresh and the editor starts
  // from what is stored now.
  const [opening, setOpening] = useState(0);
  const [loaded, setLoaded] = useState<{
    opening: number;
    outcome: Awaited<ReturnType<typeof openTreatmentCostsAction>>;
  } | null>(null);

  useEffect(() => {
    if (!openId) return;
    let live = true;
    const thisOpening = opening;
    openTreatmentCostsAction(openId).then((outcome) => {
      if (live) setLoaded({ opening: thisOpening, outcome });
    });
    return () => {
      live = false;
    };
  }, [openId, opening]);

  const outcome = openId && loaded?.opening === opening ? loaded.outcome : null;

  // Rules fetched again after one is written from inside the pop-up, so it
  // appears in the price's rule list — without refetching the prices, which
  // would throw away what is being edited.
  const [freshRules, setFreshRules] = useState<{ opening: number; rules: RuleSummary[] } | null>(null);
  const refreshRules = async () => {
    if (!openId) return;
    const thisOpening = opening;
    const again = await openTreatmentCostsAction(openId);
    if (again.ok) setFreshRules({ opening: thisOpening, rules: again.rules });
  };
  const open = (treatmentId: string) => {
    setOpening((n) => n + 1);
    setOpenId(treatmentId);
  };
  const close = () => setOpenId(null);
  const openName = rates.find((r) => r.treatmentId === openId)?.treatmentName ?? "";

  // Grouped so the order a treatment tries its rates in is visible, which is
  // what decides which one an asset is charged.
  const groups = new Map<string, CostRateListRow[]>();
  for (const rate of rates) groups.set(rate.treatmentId, [...(groups.get(rate.treatmentId) ?? []), rate]);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Treatment</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Applies when</TableHead>
            <TableHead className="text-right">Unit Cost</TableHead>
            <TableHead className="text-right">Mobilization</TableHead>
            <TableHead className="text-right">Maintenance / yr</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...groups.values()].flatMap((group) =>
            group.map((r, index) => (
              <TableRow key={r.id} className={r.treatmentId === openId ? "bg-muted/50" : undefined}>
                <TableCell>
                  {/* Only the first row of each treatment is labelled, so the
                      grouping reads at a glance. */}
                  {index !== 0 ? (
                    <span className="sr-only">{r.treatmentName}</span>
                  ) : canEdit ? (
                    <button
                      type="button"
                      onClick={() => open(r.treatmentId)}
                      className="text-left font-medium text-primary hover:underline"
                      title={`Edit ${r.treatmentName}'s prices`}
                    >
                      {r.treatmentName}
                    </button>
                  ) : (
                    <Link
                      href={`/settings/treatments/${r.treatmentId}#costs`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.treatmentName}
                    </Link>
                  )}
                </TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="whitespace-normal break-words text-sm">
                  {r.ruleName ? r.ruleName : <Badge variant="secondary">anything else</Badge>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {formatCurrency(r.unitCost)} {r.costUnit}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(r.mobilizationCost)}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.annualMaintenanceCost)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <EditorDialog
        open={openId != null}
        onClose={close}
        title={`${openName} — what it costs`}
        description={
          <>
            Prices are tried top to bottom, and the first whose rule matches is charged.{" "}
            <Link href={`/settings/treatments/${openId}`} className="text-primary hover:underline">
              Open {openName} →
            </Link>
          </>
        }
      >
        {!outcome ? (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading prices…
          </p>
        ) : !outcome.ok ? (
          <p className="py-6 text-sm text-destructive">{outcome.message}</p>
        ) : (
          <CostEditor
            key={opening}
            treatmentName={outcome.costs.treatmentName}
            initial={outcome.costs.rates}
            rules={freshRules?.opening === opening ? freshRules.rules : outcome.rules}
            onRuleSaved={refreshRules}
            canEdit
            canEditRules={canEditRules}
            onSave={setTreatmentCostsAction.bind(null, outcome.costs.treatmentId)}
            inDialog
            onCancel={close}
            onSaved={(shouldClose) => {
              if (shouldClose) close();
            }}
          />
        )}
      </EditorDialog>
    </div>
  );
}
