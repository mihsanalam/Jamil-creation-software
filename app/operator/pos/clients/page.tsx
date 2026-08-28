import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { ClientsClient } from "./clients-client";

export const metadata: Metadata = {
  title: "Clients - Jamil Creations",
};

// Server-rendered page; auth (OPERATOR-only) is enforced by middleware.
export default function ClientsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="OPERATOR" activeRoute="clients" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full max-w-5xl">
          <ClientsClient />
        </div>
      </main>
    </div>
  );
}
