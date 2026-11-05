import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

/**
 * Where a session that has stopped being valid is sent to be cleared.
 *
 * When an account is deactivated or deleted, auth() starts answering "nobody"
 * but the cookie is still in the browser — a server component cannot change
 * cookies — and the proxy, which never reads the database, still sees a
 * well-formed token. Redirecting straight to /login would have the proxy
 * bounce them back to /dashboard, which would send them to /login, forever.
 * A route handler can clear the cookie, so the hop to /login sticks.
 *
 * Only a session that is already over is signed out. A GET that signed anyone
 * out would let any page on the internet log people out of this one with an
 * image tag; one that still has a valid session is just sent back in.
 */
export async function GET() {
  if (await auth()) redirect("/dashboard");
  await signOut({ redirectTo: "/login?error=SessionEnded" });
}
