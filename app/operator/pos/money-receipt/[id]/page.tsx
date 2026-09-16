import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { MoneyReceiptClient } from "./money-receipt-client";

export const metadata: Metadata = {
  title: "Money receipt - Jamil Creations",
};

// Server-rendered page; auth (OPERATOR-only) is enforced by middleware.
export default async function MoneyReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar role="OPERATOR" activeRoute="due-collection" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full">
          <MoneyReceiptClient paymentId={id} />
        </div>
      </main>
    </div>
  );
}
