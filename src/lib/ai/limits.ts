import type { RateLimitScope } from "./types";

/**
 * Komentar EngageFlow pendek. Hindari meminta 4096 token untuk setiap request
 * kecil karena free tier umumnya juga membatasi token per menit/hari.
 */
export function outputTokenLimit(count: number): number {
  return Math.min(4096, Math.max(640, 256 + count * 128));
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
  const scope: RateLimitScope =
    retryAfterSec >= 60 * 60 ||
    message.includes("per day") ||
    message.includes("daily") ||
    message.includes("rpd")
      ? "daily"
      : message.includes("token") || message.includes("tpm")
        ? "tokens"
        : retryAfterSec <= 15 * 60
          ? "minute"
          : "unknown";

  return { retryAfterSec, scope };
}
