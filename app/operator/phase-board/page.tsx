import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { PhaseBoardClient } from "./phase-board-client";

export const metadata: Metadata = {
  title: "Phase Board - Jamil Creations",
};

// Server-rendered page; auth (OPERATOR-only) is enforced by middleware.
export default function PhaseBoardPage() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar role="OPERATOR" activeRoute="phase-board" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <PhaseBoardClient />
      </main>
    </div>
  );
}
