import { redirect } from "next/navigation";
import type { Session } from "next-auth";

import { auth } from "@/auth";
import type { UserRole } from "@/types/next-auth";

/**
 * The signed-in user, or null when nobody is logged in.
 * Server-only — never import this into a client component.
 */
export async function getCurrentUser(): Promise<Session["user"] | null> {
  const session = await auth();
  return session?.user ?? null;
}

/** Redirects to /login when logged out, then returns the session user. */
export async function requireUser(): Promise<Session["user"]> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

/**
 * Redirects unless the signed-in user has one of the given roles.
 * Middleware already enforces roles per route, so this is a second
 * safety net for server-code that must not run for the wrong role.
 */
export async function requireRole(
  roles: UserRole[]
): Promise<Session["user"]> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}
