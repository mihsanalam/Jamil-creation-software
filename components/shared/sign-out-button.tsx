"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

/**
 * Client "Sign out" button. NextAuth's client helper clears the session
 * cookie and sends the user back to the login page.
 */
export function SignOutButton() {
  const { t } = useLanguage();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-2 text-cream hover:bg-charcoal/70 hover:text-cream"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut className="size-4" />
      {t("Sign out")}
    </Button>
  );
}