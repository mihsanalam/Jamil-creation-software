"use client";

import useSWR from "swr";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Shape of GET /api/health. */
interface HealthPayload {
  status: "ok" | "degraded";
  database: { ok: boolean; latencyMs: number; error: string | null };
  serverTime: string;
}

/**
 * How often to re-check. Every screen polls its own data far more often than
 * this — the point here is only to notice the moments when those polls stop
 * working, so once a minute is plenty (and keeps the log quiet).
 */
const POLL_MS = 60_000;

async function fetchHealth(url: string): Promise<HealthPayload> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    // 503 from the health route itself means "server up, database down".
    throw new Error(
      payload?.database?.error ?? payload?.message ?? "Server unavailable"
    );
  }
  return payload as HealthPayload;
}

/**
 * In-app "is the data fresh?" indicator (Tier 4, item 24).
 *
 * Every dashboard here polls an API every few seconds, but the handlers only
 * `console.error` when something breaks — so an operator looking at a phase
 * board that had quietly stopped updating had no way to tell it apart from a
 * genuinely idle one. This sits in the sidebar on every screen and answers
 * that question at a glance: green = the server just answered, red = the polls
 * are failing and whatever is on screen may be stale.
 */
export function SystemStatus() {
  const { t } = useLanguage();
  const { data, error, isLoading } = useSWR<HealthPayload>(
    "/api/health",
    fetchHealth,
    {
      refreshInterval: POLL_MS,
      // Show the failure straight away instead of retrying behind the
      // scenes — an indicator that waits before admitting trouble is useless.
      shouldRetryOnError: false,
      revalidateOnFocus: false,
    }
  );

  const isDown = Boolean(error);
  const label = isLoading
    ? t("Checking…")
    : isDown
      ? t("Sync issue")
      : t("Live");

  // The tooltip carries the detail an operator would be asked for.
  const detail = isDown
    ? `${t("Could not reach the server. Figures on screen may be stale.")} ${
        error instanceof Error ? error.message : ""
      }`.trim()
    : data
      ? `${t("Data is up to date.")} ${t("Database")}: ${data.database.latencyMs} ms · ${new Date(
          data.serverTime
        ).toLocaleTimeString()}`
      : t("Checking…");

  return (
    <div
      className="flex items-center gap-2 px-4 pb-2 pt-3 text-xs text-cream/70"
      role="status"
      aria-live="polite"
      title={detail}
    >
      {isDown ? (
        <AlertTriangle className="size-3.5 shrink-0 text-rust" aria-hidden />
      ) : (
        <CheckCircle2
          className={cn(
            "size-3.5 shrink-0",
            isLoading ? "text-cream/40" : "text-green-500"
          )}
          aria-hidden
        />
      )}
      <span className="truncate">
        {/* The English string is the accessible name; the label above is shown. */}
        <span className="sr-only">{t("System status")}: </span>
        {label}
      </span>
    </div>
  );
}
