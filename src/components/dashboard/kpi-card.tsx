import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: LucideIcon;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 py-2">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div
            className={cn(
              "mt-1 text-3xl font-semibold tracking-tight",
              tone === "warning" && "text-amber-600",
              tone === "danger" && "text-destructive"
            )}
          >
            {value}
          </div>
          {sublabel && <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div>}
        </div>
        {Icon && (
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
