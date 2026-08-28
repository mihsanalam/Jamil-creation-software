"use client";

import Link from "next/link";
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  PackagePlus,
  ReceiptText,
  ScrollText,
  ShoppingCart,
  Users2,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { SignOutButton } from "@/components/shared/sign-out-button";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/next-auth";

interface NavItem {
  /** Label shown in the sidebar. */
  label: string;
  /** Route the item links to. */
  href: string;
  /** Value that pages pass as `activeRoute` to highlight this item. */
  key: string;
  icon: LucideIcon;
}

// Nav per role — mirrors the pages under each role's route prefix.
const NAV_BY_ROLE: Record<UserRole, { subtitle: string; items: NavItem[] }> = {
  OWNER: {
    subtitle: "Owner Console",
    items: [
      { label: "Dashboard", href: "/owner/dashboard", key: "dashboard", icon: LayoutDashboard },
      { label: "Phase Templates", href: "/owner/phase-templates", key: "phase-templates", icon: ClipboardList },
      { label: "Reports", href: "/owner/reports", key: "reports", icon: ReceiptText },
      { label: "Sales & Dues", href: "/owner/sales-dues", key: "sales-dues", icon: Wallet },
      { label: "Users", href: "/owner/users", key: "users", icon: Users2 },
    ],
  },
  COLLECTOR: {
    subtitle: "Production Collector",
    items: [
      { label: "Fabric Intake", href: "/collector/fabric-intake", key: "fabric-intake", icon: PackagePlus },
      { label: "Batch List", href: "/collector/batch-list", key: "batch-list", icon: ScrollText },
      { label: "Finished Goods Intake", href: "/collector/finished-goods", key: "finished-goods", icon: Boxes },
      { label: "Stock Search", href: "/collector/warehouse-search", key: "warehouse-search", icon: Warehouse },
      { label: "Sales & Dues", href: "/collector/sales-dues", key: "sales-dues", icon: ReceiptText },
    ],
  },
  OPERATOR: {
    subtitle: "Operator Console",
    items: [
      { label: "Work Order", href: "/operator/work-orders", key: "work-orders", icon: ClipboardList },
      { label: "Phase Board", href: "/operator/phase-board", key: "phase-board", icon: Boxes },
      { label: "New Sale", href: "/operator/pos/new-sale", key: "new-sale", icon: ShoppingCart },
      { label: "Clients", href: "/operator/pos/clients", key: "clients", icon: Users2 },
      { label: "Due Collection", href: "/operator/pos/due-collection", key: "due-collection", icon: ReceiptText },
    ],
  },
};

interface SidebarProps {
  /** Which role's nav to render, e.g. "COLLECTOR". */
  role: UserRole;
  /** Key of the nav item belonging to the current screen (e.g. "fabric-intake"). */
  activeRoute?: string;
}

/**
 * Shared app sidebar used by every /owner, /collector and /operator page
 * (see CLAUDE.md "UI Rule — Sidebar"). Charcoal rail with a serif gold
 * wordmark; the active item is highlighted with the brand gold accent.
 */
export function Sidebar({ role, activeRoute }: SidebarProps) {
  const { subtitle, items } = NAV_BY_ROLE[role];

  return (
    <aside className="sticky top-0 hidden h-screen w-[280px] shrink-0 flex-col border-r border-charcoal/20 bg-charcoal py-6 md:flex">
      <div className="mb-8 px-5">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-gold">
          Jamil Creations
        </h1>
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-cream/60">
          {subtitle}
        </p>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
        {items.map(({ label, href, key, icon: Icon }) => {
          const isActive = key === activeRoute;
          return (
            <Link
              key={key}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 border-l-[3px] px-4 py-2.5 text-sm transition-colors",
                isActive
                  ? "border-gold bg-charcoal/70 font-semibold text-gold"
                  : "border-transparent text-cream/70 hover:bg-charcoal/70 hover:text-cream"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-charcoal/40 px-3 pt-4">
        <SignOutButton />
      </div>
    </aside>
  );
}

