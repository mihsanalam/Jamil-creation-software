import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { requireUser } from "@/lib/auth-helpers";
import { ChangePasswordClient } from "./change-password-client";

export const metadata: Metadata = {
  title: "My Account - Jamil Creations",
};

/**
 * My Account (Tier 4) — every signed-in role changes their own password here.
 * The sidebar is rendered for the visitor's own role so the screen feels like
 * part of that role's console.
 */
export default async function AccountPasswordPage() {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar role={user.role} activeRoute="account" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="mx-auto w-full max-w-xl">
          <ChangePasswordClient />
        </div>
      </main>
    </div>
  );
}