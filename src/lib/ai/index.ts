/**
 * AI Orchestrator — bagi request lintas provider berdasarkan bobot free-tier,
 * lalu fallback mengikuti priority jika provider terpilih gagal.
 *
 * Usage:
 *   import { generateWithRotation, PROVIDERS } from "@/lib/ai";
 *   const result = await generateWithRotation(creds, args);
 */

import { cerebras } from "./cerebras";
import { gemini } from "./gemini";
import { groq } from "./groq";
import { openrouter } from "./openrouter";
import {
  ProviderError,
  ProviderRateLimitError,
  type GenerateArgs,
  type GeneratedComment,
  type ProviderClient,
  type ProviderCred,
  type ProviderFailure,
  type ProviderName,
} from "./types";

export const PROVIDERS: Record<ProviderName, ProviderClient> = {
  gemini,
  cerebras,
  groq,
  openrouter,
};

export const PROVIDER_LIST: ProviderName[] = [
  "gemini",
  "cerebras",
  "groq",
  "openrouter",
];

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  gemini: "Google Gemini",
  cerebras: "Cerebras",
  groq: "Groq",
  openrouter: "OpenRouter Free",
};

export const PROVIDER_DEFAULT_PRIORITY: Record<ProviderName, number> = {
  cerebras: 10,
  groq: 20,
  gemini: 30,
  openrouter: 40,
};

/** Pembagian konservatif untuk akun free: Cerebras 50%, Groq 35%, Gemini 15%. */
export const PROVIDER_FREE_WEIGHTS: Record<ProviderName, number> = {
  cerebras: 50,
  groq: 35,
  gemini: 15,
  openrouter: 0,
};

export const PROVIDER_MODEL_OPTIONS: Record<
  ProviderName,
  { value: string; label: string }[]
> = {
  gemini: [
    {
      value: "gemini-2.5-flash-lite",
      label: "gemini-2.5-flash-lite — hemat token, direkomendasikan",
    },
    {
      value: "gemini-2.5-flash",
      label: "gemini-2.5-flash — kualitas lebih tinggi",
    },
    {
      value: "gemini-2.5-pro",
      label: "gemini-2.5-pro — kuota free lebih ketat",
    },
  ],
  cerebras: [
    {
      value: "gpt-oss-120b",
      label: "gpt-oss-120b — model free aktif, direkomendasikan",
    },
  ],
  groq: [
    {
      value: "qwen/qwen3.6-27b",
      label: "qwen/qwen3.6-27b — reasoning dapat dimatikan",
    },
    {
      value: "openai/gpt-oss-20b",
      label: "openai/gpt-oss-20b — cepat dan hemat",
    },
    {
      value: "openai/gpt-oss-120b",
      label: "openai/gpt-oss-120b — kualitas lebih tinggi",
    },
  ],
  openrouter: [
    {
      value: "openrouter/free",
      label: "openrouter/free — jaringan cadangan otomatis",
    },
  ],
};

export interface RotationResult {
  comments: GeneratedComment[];
  /** Provider yang sukses dipakai */
  usedProvider: ProviderName;
  /** Provider yang dicoba tapi gagal — untuk logging / UI */
  failedProviders: ProviderFailure[];
}

export class AllProvidersFailedError extends Error {
  constructor(public failedProviders: ProviderFailure[]) {
    const summary = failedProviders
      .map((f) => `${f.provider}: ${f.reason}`)
      .join(" | ");
    super(`Semua AI provider gagal. ${summary}`);
  }
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function weightedOrder(creds: ProviderCred[], args: GenerateArgs): ProviderCred[] {
  const byPriority = [...creds].sort((a, b) => a.priority - b.priority);
  const fallbackOnly = byPriority.filter((cred) => cred.provider === "openrouter");
  const primary = byPriority.filter((cred) => cred.provider !== "openrouter");
  if (primary.length === 0) return fallbackOnly;

  const totalWeight = primary.reduce(
    (sum, cred) => sum + PROVIDER_FREE_WEIGHTS[cred.provider],
    0
  );
  let bucket = stableHash(`${args.url}|${args.adName ?? ""}`) % totalWeight;
  let selected = primary[0];
  for (const cred of primary) {
    bucket -= PROVIDER_FREE_WEIGHTS[cred.provider];
    if (bucket < 0) {
      selected = cred;
      break;
    }
  }
  return [
    selected,
    ...primary.filter((cred) => cred.id !== selected.id),
    ...fallbackOnly,
  ];
}

/**
 * Pilih provider utama secara weighted berdasarkan URL (stabil per link),
 * lalu fallback berdasarkan priority.
 *
 * @param creds Credentials user, sudah harus terurut by priority ascending dan filter enabled
 * @param args Arguments untuk generate
 */
export async function generateWithRotation(
  creds: ProviderCred[],
  args: GenerateArgs
): Promise<RotationResult> {
  if (creds.length === 0) {
    throw new Error(
      "Belum ada AI provider yang aktif. Set up minimal 1 di Settings."
    );
  }

  const failed: RotationResult["failedProviders"] = [];

  for (const cred of weightedOrder(creds, args)) {
    const client = PROVIDERS[cred.provider];
    if (!client) {
      failed.push({
        provider: cred.provider,
        reason: "Unknown provider",
        rateLimited: false,
        retryAfterSec: 3600,
        scope: "unknown",
      });
      continue;
    }

    try {
      const comments = await client.generate(args, cred.apiKey, cred.model);
      if (comments.length === 0) {
        failed.push({
          provider: cred.provider,
          reason: "Komentar kosong",
          rateLimited: false,
          retryAfterSec: 300,
          scope: "unknown",
        });
        continue;
      }
      return {
        comments,
        usedProvider: cred.provider,
        failedProviders: failed,
      };
    } catch (e) {
      if (e instanceof ProviderRateLimitError) {
        failed.push({
          provider: cred.provider,
          reason: `${e.message} · ${e.scope}, retry ${e.retryAfterSec}s`,
          rateLimited: true,
          retryAfterSec: e.retryAfterSec,
          scope: e.scope,
        });
      } else if (e instanceof ProviderError) {
        failed.push({
          provider: cred.provider,
          reason: e.message,
          rateLimited: false,
          retryAfterSec: [400, 401, 403, 404].includes(e.status) ? 3600 : 300,
          scope: "unknown",
        });
      } else {
        failed.push({
          provider: cred.provider,
          reason: (e as Error)?.message ?? "Unknown error",
          rateLimited: false,
          retryAfterSec: 120,
          scope: "unknown",
        });
      }
      // Lanjut ke provider berikutnya
      continue;
    }
  }

  throw new AllProvidersFailedError(failed);
}

export * from "./types";
