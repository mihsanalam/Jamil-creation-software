"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Menu,
  PackagePlus,
  ReceiptText,
  RotateCcw,
  ScrollText,
  ShoppingCart,
  Users2,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";

import { LanguageToggle } from "@/components/shared/language-toggle";
import { SignOutButton } from "@/components/shared/sign-out-button";
import { useLanguage } from "@/lib/i18n";
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
      { label: "Analytics", href: "/owner/analytics", key: "analytics", icon: BarChart3 },
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
    ],
  },
  OPERATOR: {
    subtitle: "Operator Console",
    items: [
      { label: "Work Order", href: "/operator/work-orders", key: "work-orders", icon: ClipboardList },
      { label: "Phase Board", href: "/operator/phase-board", key: "phase-board", icon: Boxes },
      { label: "New Sale", href: "/operator/pos/new-sale", key: "new-sale", icon: ShoppingCart },
      { label: "Return", href: "/operator/pos/return", key: "return", icon: RotateCcw },
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
 * The nav list itself — shared by the desktop rail and the mobile drawer so
 * both always render the same items with the same active highlight.
 */
function NavList({
  items,
  activeRoute,
  onNavigate,
}: {
  items: NavItem[];
  activeRoute?: string;
  /** Called when a link is tapped (used to close the mobile drawer). */
  onNavigate?: () => void;
}) {
  const { t } = useLanguage();

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto">
      {items.map(({ label, href, key, icon: Icon }) => {
        const isActive = key === activeRoute;
        return (
          <Link
            key={key}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 border-l-[3px] px-4 py-2.5 text-sm transition-colors",
              isActive
                ? "border-gold bg-charcoal/70 font-semibold text-gold"
                : "border-transparent text-cream/70 hover:bg-charcoal/70 hover:text-cream"
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {t(label)}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Shared app sidebar used by every /owner, /collector and /operator page
 * (see CLAUDE.md "UI Rule — Sidebar"). Charcoal rail with a serif gold
 * wordmark; the active item is highlighted with the brand gold accent.
 */
export function Sidebar({ role, activeRoute }: SidebarProps) {
  const { subtitle, items } = NAV_BY_ROLE[role];
  const { t } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // While the mobile drawer is open: lock page scroll and close on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  return (
    <>
      {/* ── Mobile top bar (below md) ──────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-cream/10 bg-charcoal px-4 md:hidden">
        <h1 className="font-serif text-lg font-bold tracking-tight text-gold">
          Jamil Creations
        </h1>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("Menu")}
          aria-expanded={drawerOpen}
          aria-controls="mobile-sidebar"
          className="cursor-pointer rounded-md p-2 text-cream transition-colors hover:bg-charcoal/70 hover:text-gold"
        >
          <Menu className="size-6" aria-hidden />
        </button>
      </header>

      {/* ── Mobile slide-in drawer (below md) ──────────────────────────── */}
      {/* visibility (not unmount) so the slide-out transition can play;
          visibility:hidden keeps it out of hit-testing and tab order. */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          drawerOpen ? "visible" : "invisible"
        )}
        aria-hidden={!drawerOpen}
      >
        {/* dimmed backdrop — tap to close */}
        <div
          onClick={() => setDrawerOpen(false)}
          className={cn(
            "absolute inset-0 bg-charcoal/60 transition-opacity duration-200",
            drawerOpen ? "opacity-100" : "opacity-0"
          )}
        />
        {/* panel */}
        <div
          id="mobile-sidebar"
          role="dialog"
          aria-modal="true"
          aria-label={t(subtitle)}
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-charcoal py-6 shadow-2xl transition-[transform,visibility] duration-200",
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="mb-1 flex items-start justify-between gap-2 pl-5 pr-3">
            <h2 className="font-serif text-2xl font-bold tracking-tight text-gold">
              Jamil Creations
            </h2>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label={t("Close menu")}
              className="cursor-pointer rounded-md p-2 text-cream/70 transition-colors hover:bg-charcoal/70 hover:text-cream"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <p className="mb-8 px-5 text-xs font-semibold uppercase tracking-widest text-cream/60">
            {t(subtitle)}
          </p>

          <NavList
            items={items}
            activeRoute={activeRoute}
            onNavigate={() => setDrawerOpen(false)}
          />

          <div className="mt-auto border-t border-charcoal/40 px-3 pt-4">
            <LanguageToggle />
            <SignOutButton />
          </div>
        </div>
      </div>

      {/* ── Desktop rail (md and up) ───────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-70 shrink-0 flex-col border-r border-charcoal/20 bg-charcoal py-6 md:flex">
        <div className="mb-8 px-5">
          <h1 className="font-serif text-2xl font-bold tracking-tight text-gold">
            Jamil Creations
          </h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-cream/60">
            {t(subtitle)}
          </p>
        </div>

        <NavList items={items} activeRoute={activeRoute} />

        <div className="mt-auto border-t border-charcoal/40 px-3 pt-4">
          <LanguageToggle />
          <SignOutButton />
        </div>
      </aside>
    </>
  );
}

