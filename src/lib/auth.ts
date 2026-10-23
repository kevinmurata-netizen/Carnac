import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { currentAccount } from "@/lib/account-check";

/**
 * The full authentication setup, for anything running on Node.
 *
 * The shared shape lives in auth.config.ts, which the Edge middleware imports
 * on its own; the only thing added here is the part that reads the database.
 * Import this from server components and route handlers, never from
 * middleware.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Re-reads the account behind every session this side of the proxy.
     *
     * A JWT is only what was true at sign-in. Returning null for an account
     * that has since been deactivated or deleted is what ends its session —
     * auth() then answers "nobody", and the (app) layout sends them out — and
     * overlaying the current role means a reassignment or a rename applies on
     * the next request rather than at the next sign-in. currentAccount() holds
     * the answer briefly so this is not a query per call; see account-check.ts.
     *
     * The proxy keeps the plain callback from auth.config.ts and so still
     * waves a deactivated user's cookie through. That is fine: it only decides
     * whether to bounce someone to /login, and every page, route and action
     * asks auth() from here before showing or changing anything.
     */
    jwt: async (params) => {
      const token = authConfig.callbacks.jwt(params);
      // Signing in has just read the account, so there is nothing to recheck.
      if (params.user) return token;
      if (!token.sub) return null;

      const account = await currentAccount(token.sub);
      if (!account) return null;
      return { ...token, ...account };
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { role: true },
        });
        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
          roleId: user.roleId,
          roleName: user.role.name,
          roleCode: user.role.code,
          permissions: Array.isArray(user.role.permissions)
            ? (user.role.permissions as string[])
            : [],
        };
      },
    }),
  ],
});
