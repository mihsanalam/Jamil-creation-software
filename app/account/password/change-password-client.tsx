"use client";

import { useState, type FormEvent } from "react";
import { signOut } from "next-auth/react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useLanguage } from "@/lib/i18n";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

// Same field styling the Users screen uses, so forms look identical app-wide.
const FIELD =
  "h-10 rounded-lg border-input bg-white px-3 text-sm focus-visible:border-gold focus-visible:ring-4 focus-visible:ring-gold/20";

/**
 * "Change my password" (Tier 4). Every role can reach this from the sidebar.
 *
 * The API bumps `users.session_version`, which invalidates every existing JWT
 * session — including this one. So after a successful change we sign the user
 * out with a short confirmation instead of leaving them on a page whose next
 * request would fail.
 */
export function ChangePasswordClient() {
  const { t } = useLanguage();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (currentPassword === "" || newPassword === "") {
      toast.error(t("Your current password and the new password are required."));
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(
        `${t("The new password must be at least")} ${MIN_PASSWORD_LENGTH} ${t("characters.")}`
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("The two new passwords do not match."));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(payload?.message ?? t("Could not change your password."));
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(
        t("Password updated. Please sign in again with your new password.")
      );
      // All sessions were just invalidated — leave cleanly through the login
      // page rather than sitting on a session that is already dead.
      await signOut({ callbackUrl: "/login" });
    } catch {
      toast.error("Could not reach the server. Please check your connection.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-charcoal md:text-4xl">
          {t("My Account")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("Change the password you use to sign in.")}
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border border-border bg-white p-6 shadow-sm"
      >
        <div className="flex items-start gap-3 rounded-lg border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-charcoal">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden />
          <p>
            {t(
              "For safety, changing your password signs you out of every device — including this one."
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="current-password"
            className="text-sm font-semibold text-charcoal"
          >
            {t("Current password")}
          </Label>
          <PasswordInput
            id="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="new-password"
            className="text-sm font-semibold text-charcoal"
          >
            {t("New password")}
          </Label>
          <PasswordInput
            id="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder={`${t("At least")} ${MIN_PASSWORD_LENGTH} ${t("characters.")}`}
            autoComplete="new-password"
            required
            className={FIELD}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="confirm-password"
            className="text-sm font-semibold text-charcoal"
          >
            {t("Confirm new password")}
          </Label>
          <PasswordInput
            id="confirm-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
            className={FIELD}
          />
        </div>

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            disabled={isSaving}
            className="h-11 rounded-lg bg-gold px-6 text-sm font-semibold text-charcoal shadow-sm transition-all hover:bg-gold/90 active:scale-[0.99]"
          >
            <KeyRound className="size-4" aria-hidden />
            {isSaving ? t("Saving…") : t("Change password")}
          </Button>
        </div>
      </form>
    </div>
  );
}