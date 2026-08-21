/**
 * Asset status → line colour, in a plain module (no "use client").
 *
 * This deliberately does NOT live in network-map.tsx: that file is a Client
 * Component, and a Server Component importing a value from it receives a
 * client-reference proxy rather than the real object. The legend is
 * server-rendered, so it would silently see an empty object and render no
 * entries at all.
 */
export const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#2563eb",
  INACTIVE: "#94a3b8",
  ABANDONED: "#ef4444",
  PLANNED: "#16a34a",
  REMOVED: "#cbd5e1",
};
