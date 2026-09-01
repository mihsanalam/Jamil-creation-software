import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { FinishedGoodsClient } from "./finished-goods-client";

export const metadata: Metadata = {
  title: "Finished Goods Intake - Jamil Creations",
};

// Server-rendered page; auth (COLLECTOR-only) is enforced by middleware.
export default function FinishedGoodsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="COLLECTOR" activeRoute="finished-goods" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full">
          <header className="mb-8 flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
              Finished goods intake
            </h1>
            <p className="text-sm text-muted-foreground">
              Turn a completed batch into a barcoded product and add it to stock.
            </p>
          </header>

          <FinishedGoodsClient />
        </div>
      </main>
    </div>
  );
}
