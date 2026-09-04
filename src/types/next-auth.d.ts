import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    organizationId: string;
    roleId: string;
    roleName: string;
    /** Stable role identity. Unlike roleName it survives a rename, so this is
     * what any decision keys on. */
    roleCode: string;
    permissions: string[];
  }

  interface Session {
    user: {
      organizationId: string;
      roleId: string;
      roleName: string;
      roleCode: string;
    /** Stable role identity. Unlike roleName it survives a rename, so this is
     * what any decision keys on. */
    roleCode: string;
      permissions: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    organizationId: string;
    roleId: string;
    roleName: string;
    /** Stable role identity. Unlike roleName it survives a rename, so this is
     * what any decision keys on. */
    roleCode: string;
    permissions: string[];
  }
}
