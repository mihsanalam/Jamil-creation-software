import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "Dashboard - Jamil Creations",
};

// Server-rendered page; auth (OWNER-only) is enforced by middleware.
export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="OWNER" activeRoute="dashboard" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full max-w-6xl">
          <DashboardClient />
        </div>
      </main>
    </div>
  );
}

