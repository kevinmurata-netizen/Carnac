/**
 * Sidebar section titles are renameable, stored under a `group:` pseudo-href in
 * the same table as page names.
 *
 * This lives in config rather than server/navigation.ts because the sidebar is
 * a client component and must not pull a Prisma module into the browser bundle.
 */
export function groupKey(label: string) {
  return `group:${label}`;
}
