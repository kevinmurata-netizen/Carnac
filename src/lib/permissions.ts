import type { Session } from "next-auth";

/** Executive is read-only per the role definitions in docs/SPEC.md §34;
 * Administrator, AssetManager, and Inspector may all record field data. */
export function canRecordFieldData(session: Session | null): boolean {
  return session?.user.roleName !== "Executive";
}
