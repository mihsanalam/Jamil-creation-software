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
    /**
     * users.session_version at sign-in (Tier 4). Copied into the JWT so a
     * password change can invalidate this session — see auth.ts.
     */
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    /** Version of users.session_version this token was issued with. */
    sessionVersion: number;
  }
}
