import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

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
