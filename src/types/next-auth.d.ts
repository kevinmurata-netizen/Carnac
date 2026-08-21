import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    organizationId: string;
    roleId: string;
    roleName: string;
    permissions: string[];
  }

  interface Session {
    user: {
      organizationId: string;
      roleId: string;
      roleName: string;
      permissions: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId: string;
    roleId: string;
    roleName: string;
    permissions: string[];
  }
}
