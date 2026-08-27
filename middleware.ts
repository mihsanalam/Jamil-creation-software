import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { ROLE_HOME } from "@/lib/roles";

// Maps each protected route prefix to the exact role allowed there
const ROLE_BY_PREFIX: Record<string, string> = {
  "/owner": "OWNER",
  "/collector": "COLLECTOR",
  "/operator": "OPERATOR",
};

export default async function middleware(request: Request) {
  const { pathname } = new URL(request.url);

  const session = await auth();

  // Logged out — go to the login page (except when already there).
  if (!session?.user) {
    if (pathname === "/login") return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Logged in — check the route prefix against the user's role.
  for (const [prefix, requiredRole] of Object.entries(ROLE_BY_PREFIX)) {
    if (pathname.startsWith(prefix) && session.user.role !== requiredRole) {
      // Role mismatch (e.g. COLLECTOR hitting /owner) — send the user to
      // their own area rather than back to the login screen.
      return NextResponse.redirect(
        new URL(ROLE_HOME[session.user.role] ?? "/login", request.url)
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on everything EXCEPT: API routes, Next.js static assets,
  // image optimizer, favicons/images, and the /login page itself.
  // Node.js runtime because auth.ts pulls in mysql2 (not Edge-compatible).
  runtime: "nodejs",
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|login).*)",
  ],
};
