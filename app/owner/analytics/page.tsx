import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { AnalyticsClient } from "./analytics-client";

export const metadata: Metadata = {
  title: "Analytics - Jamil Creations",
};

export default function AnalyticsPage() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar role="OWNER" activeRoute="analytics" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full">
          <AnalyticsClient />
        </div>
      </main>
    </div>
  );
}
