import { Droplets, Flame, Network, Zap } from "lucide-react";
import type { BrandLogo as BrandLogoKey } from "@/lib/branding";
import { cn } from "@/lib/utils";

const ICONS = { droplets: Droplets, zap: Zap, flame: Flame, network: Network } as const;

/** The product's mark, as chosen under Settings › Branding. */
export function BrandLogo({ logo, className }: { logo: BrandLogoKey; className?: string }) {
  const Icon = ICONS[logo] ?? Network;
  return <Icon className={className} aria-hidden />;
}

/** The product's name as a wordmark: Orbitron, in capitals, spaced out — the
 * one place the app's type is meant to stand out. Size it with className. */
export function BrandName({ name, className }: { name: string; className?: string }) {
  return <span className={cn("font-brand font-medium uppercase tracking-[0.08em]", className)}>{name}</span>;
}
