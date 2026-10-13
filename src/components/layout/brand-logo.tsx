import { Droplets, Flame, Network, Zap } from "lucide-react";
import type { BrandLogo as BrandLogoKey } from "@/lib/branding";

const ICONS = { droplets: Droplets, zap: Zap, flame: Flame, network: Network } as const;

/** The product's mark, as chosen under Settings › Branding. */
export function BrandLogo({ logo, className }: { logo: BrandLogoKey; className?: string }) {
  const Icon = ICONS[logo] ?? Network;
  return <Icon className={className} aria-hidden />;
}
