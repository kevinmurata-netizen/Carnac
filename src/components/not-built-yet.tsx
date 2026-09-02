import { Construction } from "lucide-react";

/**
 * Marks a capability the app does not have yet.
 *
 * Deliberately says nothing about when it arrives. The previous copy named a
 * development phase, which went stale the moment that phase shipped and told
 * people to wait for something that was never scheduled in it.
 */
export function NotBuiltYet({ feature, note }: { feature: string; note?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <Construction className="h-8 w-8 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">{feature} isn&apos;t built yet</p>
      {note && <p className="max-w-sm text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
