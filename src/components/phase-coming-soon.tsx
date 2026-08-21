import { Construction } from "lucide-react";

export function PhaseComingSoon({ feature, phase }: { feature: string; phase: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <Construction className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">{feature} isn&apos;t built yet</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        This ships in Phase {phase} of the CARNAC development plan, following the platform foundation.
      </p>
    </div>
  );
}
