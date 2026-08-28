import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { BatchDetailClient } from "./batch-detail-client";

export const metadata: Metadata = {
  title: "Work Order - Jamil Creations",
};

// Server-rendered page; auth (OPERATOR-only) is enforced by middleware.
// Reached from the Phase Board (card click), not from direct nav, so no
// activeRoute is passed to the Sidebar.
export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex min-h-screen">
      <Sidebar role="OPERATOR" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="mx-auto w-full max-w-4xl">
          <BatchDetailClient workOrderId={id} />
        </div>
      </main>
    </div>
  );
}
