import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Behind a proxy — which is how Vercel serves every deployment — Auth.js
  // refuses to infer its own origin unless told the Host header is
  // trustworthy, and sign-in fails with UntrustedHost. Local dev is
  // unaffected because localhost is trusted anyway.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
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
});
