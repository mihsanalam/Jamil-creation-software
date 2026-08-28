import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { WarehouseSearchClient } from "./warehouse-search-client";

export const metadata: Metadata = {
  title: "Warehouse Search - Jamil Creations",
};

// Server-rendered page; auth (COLLECTOR-only) is enforced by middleware.
export default function WarehouseSearchPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="COLLECTOR" activeRoute="warehouse-search" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full max-w-5xl">
          <header className="mb-8 flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
              Warehouse search
            </h1>
            <p className="text-sm text-muted-foreground">
              Look up any finished product in stock by barcode, batch number, or product type.
            </p>
          </header>

          <WarehouseSearchClient />
        </div>
      </main>
    </div>
  );
}
