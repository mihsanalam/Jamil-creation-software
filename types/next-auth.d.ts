import { DefaultSession } from "next-auth";

// Custom role values used across the app — mirrors the users.role column
export type UserRole = "OWNER" | "COLLECTOR" | "OPERATOR";

declare module "next-auth" {
  interface Session {
    user: {
      /** Database ID of the user */
      id: string;
      /** Role of the user, e.g. used for route protection */
      role: UserRole;
    } & DefaultSession["user"]; // keeps the default name/email/image fields
  }

  interface User {
    id?: string;
    role?: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
  }
}
