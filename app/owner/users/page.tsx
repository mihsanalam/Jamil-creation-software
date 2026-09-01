import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { UsersClient } from "./users-client";

export const metadata: Metadata = {
  title: "Users - Jamil Creations",
};

// Server-rendered page; auth (OWNER-only) is enforced by middleware.
export default function UsersPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="OWNER" activeRoute="users" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full">
          <UsersClient />
        </div>
      </main>
    </div>
  );
}
