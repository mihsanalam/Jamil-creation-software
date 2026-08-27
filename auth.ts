import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import type { UserRole } from "@/types/next-auth";

// Shape of a row coming back from the users table
interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
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

        // Find the user by email, but only if their account is ACTIVE
        const [rows] = await db.query<UserRow[]>(
          "SELECT id, name, email, password_hash, role FROM users WHERE email = ? AND status = 'ACTIVE' LIMIT 1",
          [email]
        );

        const user = rows[0];
        // No matching active user — same result as a wrong password,
        // so we don't reveal whether the email exists
        if (!user) {
          return null;
        }

        // Compare the submitted password with the stored bcrypt hash
        const passwordMatches = await bcrypt.compare(
          password,
          user.password_hash
        );
        if (!passwordMatches) {
          return null;
        }

        // Only these fields travel into the JWT
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as UserRole,
        };
      },
    }),
  ],

  callbacks: {
    // Runs right after a successful sign-in — copy id and role into the JWT
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role as UserRole;
      }
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
