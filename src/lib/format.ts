export function formatFeetAsMiles(feet: number, fractionDigits = 1): string {
  return `${(feet / 5280).toFixed(fractionDigits)} mi`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/** Whole dollars; large figures abbreviated so KPI cards stay readable. */
export function formatCurrency(value: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact) {
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function formatInches(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}"`;
}

export function ageInYears(installationDate: Date | null | undefined): number | null {
  if (!installationDate) return null;
  const ms = Date.now() - installationDate.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ABANDONED: "Abandoned",
  PLANNED: "Planned",
  REMOVED: "Removed",
};

export function formatStatus(status: string): string {
  return STATUS_LABEL[status] ?? status;
}
