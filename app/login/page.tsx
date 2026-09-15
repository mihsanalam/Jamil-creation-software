"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn, getSession } from "next-auth/react";
import { ROLE_HOME } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from "@/lib/login-policy";

/**
 * Maps the `code` NextAuth puts on the sign-in response to a message the user
 * can act on (Tier 4). Anything unrecognised falls back to the generic
 * "invalid email or password" so we never leak whether an account exists.
 */
function messageForCode(code: string | undefined): string {
  switch (code) {
    case "locked":
      return `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`;
    case "inactive":
      return "This account has been deactivated. Ask the owner to reactivate it.";
    default:
      return "Invalid email or password";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(messageForCode(result.code));
        return;
      }

      // Route the user to the home screen for their role.
      const session = await getSession();
      const home = session?.user?.role ? ROLE_HOME[session.user.role] : "/login";
      router.push(home);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream p-4">
      <Card className="w-full max-w-sm bg-white shadow-lg">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-serif text-2xl font-semibold tracking-wide text-charcoal">
            Jamil Creations
          </CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@jamilcreations.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {/* Brute-force protection is on; say so before they start guessing
                (the exact numbers come from lib/login-policy.ts so the policy
                has one source of truth). */}
            <p className="text-xs text-muted-foreground">
              {`After ${MAX_FAILED_ATTEMPTS} failed attempts the account is locked for ${LOCKOUT_MINUTES} minutes.`}
            </p>

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="mt-1 w-full bg-gold text-charcoal hover:bg-gold/90"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

