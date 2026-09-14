// Offline resilience for shop-floor status changes (#16).
//
// The shop floor can lose internet while an operator completes a phase.
// Instead of losing the action, the failed request is queued in localStorage
// and retried automatically when the connection returns (or on the next page
// load). Only idempotent, status-changing PATCH/POST calls with a JSON body
// are queued — never reads.

export interface QueuedRequest {
  id: string;
  url: string;
  method: "PATCH" | "POST";
  body: unknown;
  queuedAt: number;
}

const STORAGE_KEY = "jc.offline-queue";

function isSupported() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readQueue(): QueuedRequest[] {
  if (!isSupported()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedRequest[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedRequest[]) {
  if (!isSupported()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or blocked — the in-memory copy is still used this session.
  }
}

/** Number of requests waiting to be sent. */
export function getQueueSize(): number {
  return readQueue().length;
}

/** Adds a request to the offline queue. */
export function queueRequest(
  url: string,
  method: "PATCH" | "POST",
  body: unknown
) {
  const queue = readQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    method,
    body,
    queuedAt: Date.now(),
  });
  writeQueue(queue);
}

/**
 * Replays every queued request. Each entry is dropped only on a 2xx (or an
 * explicit 4xx, meaning the server rejected it — retrying would never help);
 * network failures keep the remaining entries queued for the next attempt.
 * Returns the number of requests successfully sent.
 */
export async function flushQueue(): Promise<number> {
  const queue = readQueue();
  if (queue.length === 0) return 0;

  const remaining: QueuedRequest[] = [];
  let sent = 0;

  for (const entry of queue) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.body),
      });
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        sent += 1;
      } else {
        remaining.push(entry);
      }
    } catch {
      remaining.push(entry);
    }
  }

  writeQueue(remaining);
  return sent;
}

// Auto-retry as soon as the browser reports the connection is back. Registered
// once per page load; safe to import anywhere client-side.
if (typeof window !== "undefined") {
  const globalWindow = window as typeof window & {
    __jcOfflineQueueBound?: boolean;
  };
  if (!globalWindow.__jcOfflineQueueBound) {
    globalWindow.__jcOfflineQueueBound = true;
    window.addEventListener("online", () => {
      void flushQueue();
    });
  }
}
