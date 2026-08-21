import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import type { Recommendation, TreatmentEvaluation } from "@/domain/waterline/treatment";
import { CheckCircle2 } from "lucide-react";

const CATEGORY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Assess: "secondary",
  Repair: "outline",
  Rehabilitate: "default",
  Renew: "destructive",
  Retire: "secondary",
};

/** Diagnostic treatments don't change condition, and on a never-inspected
 * asset the "current" condition is unknown — printing the raw projection
 * there would show a fabricated 0. */
function formatProjectedCondition(evaluation: TreatmentEvaluation): string {
  if (evaluation.conditionGain === 0) return "No change";
  return `${evaluation.projectedCondition} (+${evaluation.conditionGain})`;
}

export function RecommendationPanel({ recommendation }: { recommendation: Recommendation }) {
  const { recommended, alternatives, noActionReason } = recommendation;

  if (!recommended) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-8">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <div>
            <div className="font-medium text-foreground">No treatment recommended</div>
            <div className="mt-0.5 text-sm text-muted-foreground">{noActionReason}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>
            Recommended: {recommended.name}
          </CardTitle>
          <Badge variant={CATEGORY_VARIANT[recommended.category] ?? "default"}>{recommended.category}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Estimated Cost" value={formatCurrency(recommended.estimatedCost)} />
            <Stat label="Projected Condition" value={formatProjectedCondition(recommended)} />
            <Stat
              label="Risk Reduction"
              value={recommended.riskReductionPct != null ? `${recommended.riskReductionPct}%` : "—"}
            />
            <Stat
              label="Life Extension"
              value={recommended.expectedLifeExtension > 0 ? `${recommended.expectedLifeExtension} yr` : "—"}
            />
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-foreground">Why?</div>
            <ul className="space-y-1.5">
              {recommended.reasons.map((reason, i) => (
                <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                  <span aria-hidden className="text-primary">
                    •
                  </span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            {recommended.description} Alternatives are ranked by risk reduction per $1,000 spent.
          </p>
        </CardContent>
      </Card>

      {alternatives.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alternatives Considered</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <AlternativesTable alternatives={alternatives} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AlternativesTable({ alternatives }: { alternatives: TreatmentEvaluation[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Treatment</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Estimated Cost</TableHead>
          <TableHead>Projected Condition</TableHead>
          <TableHead>Risk Reduction</TableHead>
          <TableHead>Risk Cut per $1k</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {alternatives.map((alt) => (
          <TableRow key={alt.name}>
            <TableCell className="font-medium">{alt.name}</TableCell>
            <TableCell>
              <Badge variant={CATEGORY_VARIANT[alt.category] ?? "default"}>{alt.category}</Badge>
            </TableCell>
            <TableCell>{formatCurrency(alt.estimatedCost)}</TableCell>
            <TableCell>{formatProjectedCondition(alt)}</TableCell>
            <TableCell>{alt.riskReductionPct != null ? `${alt.riskReductionPct}%` : "—"}</TableCell>
            <TableCell>{alt.riskReductionPerThousand != null ? alt.riskReductionPerThousand.toFixed(3) : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
