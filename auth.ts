import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import {
  clearFailedAttempts,
  getLockState,
  recordFailedAttempt,
} from "@/lib/login-throttle";
import { readSessionState } from "@/lib/session-version";
import type { UserRole } from "@/types/next-auth";

// Shape of a row coming back from the users table
interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: string;
  session_version: number;
}

// A real bcrypt hash of a throwaway string. When the email doesn't exist we
// still run one comparison against this, so a wrong email and a wrong password
// take the same time — an attacker can't discover valid emails by timing.
const DUMMY_PASSWORD_HASH =
  "$2b$10$qZPZRN6OjamHvrf8khkC2.dFzLXTzSiyCwUdO7QvSSEztYh8IXV0O";

/** Thrown with a distinct `code` so the login page can explain the lockout. */
class AccountLockedError extends CredentialsSignin {
  code = "locked";
}

/** Thrown when the account exists but is not ACTIVE (deactivated). */
class AccountInactiveError extends CredentialsSignin {
  code = "inactive";
}


export const { handlers, auth, signIn, signOut } = NextAuth({
  // We store session data in a signed JWT cookie — no session table needed
  session: {
    strategy: "jwt",
  },

  // Our own login page instead of the built-in one
  pages: {
    signIn: "/login",
  },

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        // Basic shape check before touching the database
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Brute-force protection (Tier 4): a locked email is rejected before
        // the password is even compared. The lockout is temporary and is
        // cleared by the next successful sign-in.
        const lock = await getLockState(normalizedEmail);
        if (lock.locked) {
          throw new AccountLockedError();
        }

        // Find the user by email. Any status is fetched on purpose: an
        // INACTIVE account gets its own message instead of pretending the
        // password was wrong.
        const [rows] = await db.query<UserRow[]>(
          `SELECT id, name, email, password_hash, role, status, session_version
           FROM users
           WHERE email = ?
           LIMIT 1`,
          [normalizedEmail]
        );

        const user = rows[0];
        // No matching user — burn the same time as a real comparison, count
        // the failure, and answer exactly like a wrong password so we don't
        // reveal whether the email exists.
        if (!user) {
          await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
          await recordFailedAttempt(normalizedEmail);
          return null;
        }

        // Compare the submitted password with the stored bcrypt hash
        const passwordMatches = await bcrypt.compare(
          password,
          user.password_hash
        );
        if (!passwordMatches) {
          await recordFailedAttempt(normalizedEmail);
          return null;
        }

        if (user.status !== "ACTIVE") {
          throw new AccountInactiveError();
        }

        // Correct password — reset the failure counter so a few earlier typos
        // don't leave the user one mistake away from a lockout.
        await clearFailedAttempts(normalizedEmail);

        // Only these fields travel into the JWT. sessionVersion is compared on
        // every later request, so a password change signs this session out.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as UserRole,
          sessionVersion: Number(user.session_version),
        };
      },
    }),
  ],

  callbacks: {
    // Runs right after a successful sign-in — copy id, role and the current
    // session version into the JWT.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role as UserRole;
        token.sessionVersion = user.sessionVersion ?? 0;
        return token;
      }

      // Tier 4 — session invalidation. A password change (or a deactivated
      // account) bumps users.session_version, which no longer matches the
      // version baked into this token. Returning null clears the session
      // cookie, so the stale session is signed out on its next request.
      // A token without an id (malformed) is treated as no longer valid.
      const userId = typeof token.id === "string" ? token.id : null;
      if (userId === null) return null;

      const state = await readSessionState(userId);
      if (state === null) return null;
      // -1 means "could not check right now" (database hiccup) — keep the
      // session alive rather than logging everyone out during an outage.
      if (state.sessionVersion === -1) return token;

      if (state.status !== "ACTIVE") return null;
      if (state.sessionVersion !== token.sessionVersion) return null;

      return token;
    },

    // Make id and role available everywhere via auth()/useSession()
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as UserRole;
      return session;
    },
  },
});
