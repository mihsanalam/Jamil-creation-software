import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { ReturnClient } from "./return-client";

export const metadata: Metadata = {
  title: "Return & Exchange - Jamil Creations",
};

// Server-rendered page; auth (OPERATOR-only) is enforced by middleware.
export default function ReturnPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="OPERATOR" activeRoute="return" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full">
          <ReturnClient />
        </div>
      </main>
    </div>
  );
}
