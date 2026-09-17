import type { RateLimitScope } from "./types";
import { candidateCount } from "./prompt";

/**
 * Komentar EngageFlow pendek. Hindari meminta 4096 token untuk setiap request
 * kecil karena free tier umumnya juga membatasi token per menit/hari.
 */
export function outputTokenLimit(count: number): number {
  return Math.min(4096, Math.max(640, 256 + candidateCount(count) * 128));
}

function parseDurationSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const value = raw.trim();

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.ceil(numeric);

  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    return Math.max(1, Math.ceil((asDate - Date.now()) / 1000));
  }

  const match = value.match(
    /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i
  );
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? Math.ceil(total) : null;
}

function retryDelayFromBody(data: any): number | null {
  const details = data?.error?.details;
  if (!Array.isArray(details)) return null;
  for (const detail of details) {
    const parsed = parseDurationSeconds(detail?.retryDelay ?? null);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function readRateLimit(
  res: Response,
  data: any,
  fallbackSeconds = 60
): { retryAfterSec: number; scope: RateLimitScope } {
  const candidates = [
    parseDurationSeconds(res.headers.get("retry-after")),
    retryDelayFromBody(data),
    parseDurationSeconds(res.headers.get("x-ratelimit-reset-requests")),
    parseDurationSeconds(res.headers.get("x-ratelimit-reset-tokens")),
  ].filter((value): value is number => value !== null && value > 0);

  const retryAfterSec = Math.min(
    24 * 60 * 60,
    Math.max(1, candidates[0] ?? fallbackSeconds)
  );
  const message = String(data?.error?.message ?? data?.message ?? "").toLowerCase();
  // Google RetryInfo dapat menyebut ~60 detik meskipun quotaId-nya PerDay.
  // Jangan menyimpulkan periode kuota hanya dari durasi retry.
  const quotaDetails = JSON.stringify(data?.error?.details ?? []).toLowerCase();
  const daily = /per.?day|daily|\brpd\b/.test(`${message} ${quotaDetails}`) ||
    (res.headers.get("x-ratelimit-remaining-requests") === "0" &&
      res.headers.has("x-ratelimit-reset-requests"));
  if (daily) {
    const isGemini = quotaDetails.includes("generativelanguage.googleapis.com");
    const [hour, minute, second] = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).format(new Date()).split(":").map(Number);
    const resetSeconds = isGemini
      ? 86400 - hour * 3600 - minute * 60 - second + 1
      : parseDurationSeconds(res.headers.get("x-ratelimit-reset-requests")) ?? 86400;
    return { retryAfterSec: Math.max(retryAfterSec, resetSeconds), scope: "daily" };
  }
  const scope: RateLimitScope =
    message.includes("token") || message.includes("tpm")
      ? "tokens"
      : retryAfterSec <= 15 * 60
        ? "minute"
        : "unknown";

  return { retryAfterSec, scope };
}
