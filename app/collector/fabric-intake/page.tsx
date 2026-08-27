import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar/sidebar";
import { FabricIntakeForm } from "./fabric-intake-form";

export const metadata: Metadata = {
  title: "Fabric Intake - Jamil Creations",
};

// Server-rendered page; auth (COLLECTOR-only) is enforced by middleware.
export default function FabricIntakePage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="COLLECTOR" activeRoute="fabric-intake" />

      <main className="flex-1 bg-cream px-4 py-6 md:px-10 md:py-8">
        <div className="w-full max-w-2xl">
          <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-charcoal md:text-3xl">
              Record fabric in.
            </h1>
          </header>

          <FabricIntakeForm />
        </div>
      </main>
    </div>
  );
}

