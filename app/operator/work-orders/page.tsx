import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { WorkOrderForm } from "./work-order-form";

export const metadata: Metadata = {
  title: "Work Order - Jamil Creations",
};

// Server-rendered page; auth (OPERATOR-only) is enforced by middleware.
export default function WorkOrdersPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="OPERATOR" activeRoute="work-orders" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full">
          <WorkOrderForm />
        </div>
      </main>
    </div>
  );
}