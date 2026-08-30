import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { Sidebar } from "@/components/sidebar/sidebar";
import { BatchListClient } from "./batch-list-client";

export const metadata: Metadata = {
  title: "Batch List - Jamil Creations",
};

// Server-rendered page; auth (COLLECTOR-only) is enforced by middleware.
export default function BatchListPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="COLLECTOR" activeRoute="batch-list" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full max-w-7xl">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
              Batch list
            </h1>
            <a
              href="/collector/fabric-intake"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99]"
            >
              <Plus className="size-4" aria-hidden />
              Record fabric
            </a>
          </header>

          <BatchListClient />
        </div>
      </main>
    </div>
  );
}

