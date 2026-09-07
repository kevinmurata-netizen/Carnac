import type { NextAuthConfig } from "next-auth";

/**
 * Everything about authentication that does NOT need the database.
 *
 * The middleware runs on the Edge runtime, where Node's `net`, `dns`, `fs` and
 * `tls` do not exist. It only ever needs to decode a JWT and decide whether to
 * redirect, but importing the full auth setup dragged in the Prisma client and,
 * since the move to a driver adapter, node-postgres along with it — which will
 * not bundle for the Edge at all.
 *
 * So the session and JWT shape live here, and `auth.ts` adds the one piece that
 * does touch the database: the credentials provider's `authorize`. This is the
 * split Auth.js documents for exactly this reason.
 */
export const authConfig = {
  // Behind a proxy — which is how Vercel serves every deployment — Auth.js
  // refuses to infer its own origin unless told the Host header is
  // trustworthy, and sign-in fails with UntrustedHost. Local dev is
  // unaffected because localhost is trusted anyway.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Filled in by auth.ts. Decoding an existing session needs the secret, not
  // the providers, so the middleware works with this empty.
  providers: [],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.organizationId = user.organizationId;
        token.roleId = user.roleId;
        token.roleName = user.roleName;
        token.roleCode = user.roleCode;
        token.permissions = user.permissions;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.organizationId = token.organizationId as string;
        session.user.roleId = token.roleId as string;
        session.user.roleName = token.roleName as string;
        session.user.roleCode = token.roleCode as string;
        session.user.permissions = token.permissions as string[];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
