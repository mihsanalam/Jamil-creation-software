import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { PhaseTemplatesClient } from "./phase-templates-client";

export const metadata: Metadata = {
  title: "Phase Templates - Jamil Creations",
};

// Server-rendered page; auth (OWNER-only) is enforced by middleware.
export default function PhaseTemplatesPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="OWNER" activeRoute="phase-templates" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full max-w-6xl">
          <PhaseTemplatesClient />
        </div>
      </main>
    </div>
  );
}

