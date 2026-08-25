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

/**
 * Dates in this system are calendar dates — an installation day, an inspection
 * day — stored as UTC instants. They are rendered in UTC for that reason: in a
 * timezone behind UTC, formatting a UTC-midnight date locally shows the
 * previous day, which is how "installed Dec 2" becomes "Dec 1" on a machine in
 * Honolulu but not on one in Berlin.
 */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** The value a `<input type="date">` needs, in the same frame formatDate reads. */
export function toDateInputValue(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** Parses what a `<input type="date">` submits. Returns null for anything that
 * is not a real date, so a bad value is rejected rather than stored as an
 * Invalid Date. */
export function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** True when two instants fall on the same UTC calendar day. Lets an edit that
 * did not move the day leave the stored instant — and its time of day —
 * untouched. */
export function sameCalendarDay(a: Date, b: Date): boolean {
  return toDateInputValue(a) === toDateInputValue(b);
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
