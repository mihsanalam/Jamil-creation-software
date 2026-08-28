import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { InvoiceClient } from "./invoice-client";

export const metadata: Metadata = {
  title: "Invoice - Jamil Creations",
};

// Server-rendered page; auth (OPERATOR-only) is enforced by middleware.
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex min-h-screen">
      <Sidebar role="OPERATOR" activeRoute="new-sale" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full max-w-3xl">
          <InvoiceClient saleId={id} />
        </div>
      </main>
    </div>
  );
}
