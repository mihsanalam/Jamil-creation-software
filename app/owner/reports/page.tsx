import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { TraceabilityClient } from "./traceability-client";

export const metadata: Metadata = {
  title: "Batch Traceability - Jamil Creations",
};

// Server-rendered page; auth (OWNER-only) is enforced by middleware.
export default function ReportsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="OWNER" activeRoute="reports" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full max-w-6xl">
          <header className="mb-8 flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
              Batch traceability
            </h1>
            <p className="text-sm text-muted-foreground">
              Pick a finished batch below (or search for it) to trace it back to
              its original fabric, every production phase, and the sale that sent
              it out.
            </p>
          </header>

          <TraceabilityClient />
        </div>
      </main>
    </div>
  );
}
