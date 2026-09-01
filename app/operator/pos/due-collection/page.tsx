import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { DueCollectionClient } from "./due-collection-client";

export const metadata: Metadata = {
  title: "Due Collection - Jamil Creations",
};

// Server-rendered page; auth (OPERATOR-only) is enforced by middleware.
export default function DueCollectionPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="OPERATOR" activeRoute="due-collection" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full">
          <DueCollectionClient />
        </div>
      </main>
    </div>
  );
}

