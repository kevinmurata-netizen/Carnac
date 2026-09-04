import type { Session } from "next-auth";

/**
 * Executive is read-only per the role definitions in docs/SPEC.md §34;
 * Administrator, Asset Manager, and Inspector may all record field data.
 *
 * Keyed on the role's code rather than its name, because names are renameable
 * — calling the Executive role "Viewer" must not hand it write access. Sessions
 * issued before the code existed carry no roleCode, so those fall back to the
 * name they were issued with rather than being silently upgraded.
 */
export function canRecordFieldData(session: Session | null): boolean {
  if (!session) return false;
  const code = session.user.roleCode;
  if (code) return code !== "EXECUTIVE";
  return session.user.roleName !== "Executive";
}
