import { Suspense } from "react";
import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { NewSaleClient } from "./new-sale-client";

export const metadata: Metadata = {
  title: "New Sale - Jamil Creations",
};

// Server-rendered page; auth (OPERATOR-only) is enforced by middleware.
// Suspense wraps the client because it reads ?client= from the URL.
export default function NewSalePage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="OPERATOR" activeRoute="new-sale" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full max-w-6xl">
          <Suspense>
            <NewSaleClient />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
