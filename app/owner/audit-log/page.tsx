import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { AuditLogClient } from "./audit-log-client";

export const metadata: Metadata = {
  title: "Audit Log - Jamil Creations",
};

// Server-rendered page; auth (OWNER-only) is enforced by middleware.
export default function AuditLogPage() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar role="OWNER" activeRoute="audit-log" />

      <main className="flex-1 bg-cream px-4 py-8 md:px-10 md:py-12">
        <div className="w-full">
          <AuditLogClient />
        </div>
      </main>
    </div>
  );
}
