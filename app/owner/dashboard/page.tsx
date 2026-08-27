import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { ArrowRight, Factory, Layers, Package, Wallet } from "lucide-react";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/roles";
import { MetricCard } from "@/components/shared/metric-card";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { Badge } from "@/components/ui/badge";

// Always read fresh numbers on each visit — this is the Owner's live view.
export const dynamic = "force-dynamic";

/** Returns the first numeric value from a one-row query. */
async function scalar(sql: string): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(sql);
  const row = rows[0] as RowDataPacket | undefined;
  const value = row ? Object.values(row)[0] : 0;
  return typeof value === "number" ? value : Number(value ?? 0);
}

const QUICK_LINKS = [
  { href: "/owner/users", title: "Users", description: "Manage accounts, roles and access." },
  { href: "/owner/phase-templates", title: "Phase Templates", description: "Define the steps a batch goes through." },
  { href: "/owner/sales-dues", title: "Sales & Dues", description: "Invoices, payments and balances." },
  { href: "/owner/reports", title: "Reports", description: "Production and sales reporting." },
];

export default async function OwnerDashboardPage() {
  const session = await auth();

  // Middleware already blocks non-Owners here, but guard anyway so this
  // page is safe even if someone reaches it outside the proxy.
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/");

  // Dashboard stats. If the DB is unreachable we show zeros rather than crash.
  let batchesInProduction = 0;
  let productsInStock = 0;
  let ordersInProgress = 0;
  let outstandingDues = 0;

  try {
    batchesInProduction = await scalar(
      "SELECT COUNT(*) AS c FROM fabric_batches WHERE status IN ('PENDING','IN_PRODUCTION')"
    );
    productsInStock = await scalar(
      "SELECT COUNT(*) AS c FROM finished_products WHERE status = 'IN_STOCK'"
    );
    ordersInProgress = await scalar(
      "SELECT COUNT(*) AS c FROM work_orders WHERE status = 'IN_PROGRESS'"
    );
    outstandingDues = await scalar(
      "SELECT COALESCE(SUM(total - amount_paid), 0) AS c FROM sales WHERE payment_status IN ('PARTIAL','DUE')"
    );
  } catch {
    // DB not reachable yet — dashboard renders with zeroed stats.
  }

  const firstName = (session.user.name ?? "Owner").split(" ")[0];

  return (
    <div className="min-h-full bg-cream">
      <header className="bg-charcoal text-cream">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm text-cream/70">Welcome back,</p>
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-xl font-semibold">{firstName}</h1>
              <Badge className="bg-gold text-charcoal">
                {ROLE_LABELS[session.user.role]}
              </Badge>
            </div>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8">
        <section>
          <h2 className="mb-4 font-heading text-lg font-medium text-charcoal">
            This week at a glance
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Batches in production" value={batchesInProduction} icon={Layers} />
            <MetricCard label="Work orders in progress" value={ordersInProgress} icon={Factory} />
            <MetricCard label="Products in stock" value={productsInStock} icon={Package} />
            <MetricCard
              label="Outstanding dues"
              value={`৳ ${outstandingDues.toLocaleString()}`}
              icon={Wallet}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-heading text-lg font-medium text-charcoal">
            Quick links
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex flex-col rounded-xl bg-white p-4 ring-1 ring-foreground/10 transition hover:ring-gold"
              >
                <span className="flex items-center justify-between text-charcoal">
                  <span className="font-medium">{link.title}</span>
                  <ArrowRight className="size-4 text-charcoal/40 transition group-hover:translate-x-0.5 group-hover:text-gold" />
                </span>
                <span className="mt-1 text-sm text-muted-foreground">
                  {link.description}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
