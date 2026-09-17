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
  CommentQualityError,
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

/** Gemini free memiliki kuota project kecil; prioritaskan Groq dan Cerebras. */
export const PROVIDER_FREE_WEIGHTS: Record<ProviderName, number> = {
  cerebras: 40,
  groq: 55,
  gemini: 5,
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
      value: "openai/gpt-oss-20b",
      label: "openai/gpt-oss-20b — cepat dan hemat, direkomendasikan",
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
  usedProviders: ProviderName[];
  /** Provider yang dicoba tapi gagal — untuk logging / UI */
  failedProviders: ProviderFailure[];
}

export class AllProvidersFailedError extends Error {
  constructor(
    public failedProviders: ProviderFailure[],
    public partialComments: GeneratedComment[] = [],
    public usedProviders: ProviderName[] = []
  ) {
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

  // Provider utama tetap mengikuti bobot. Jika ia gagal, fallback bersifat
  // adaptif: provider yang paling lama belum sukses dicoba lebih dahulu.
  // Priority hanya menjadi tie-breaker, sehingga satu provider yang stabil
  // tidak terus-menerus mengambil semua request fallback.
  const adaptiveFallback = primary
    .filter((cred) => cred.id !== selected.id)
    .sort((a, b) => {
      const aLast = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bLast = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      if (aLast !== bLast) return aLast - bLast;
      // Jika sama-sama belum pernah dipakai, gunakan prioritas utama. Jangan
      // sengaja menumpuk fallback ke Gemini yang kuota free-nya kecil.
      return a.priority - b.priority;
    });

  return [
    selected,
    ...adaptiveFallback,
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
  const accepted = [...(args.partialComments ?? [])];
  const usedProviders = new Set<ProviderName>();
  const order = weightedOrder(creds, args);
  // Maksimal satu repair tambahan, bukan retry tanpa batas per provider.
  let repairUsed = false;
  let lastUsedProvider = order[0].provider;

  if (accepted.length >= args.count) {
    return {
      comments: accepted.slice(0, args.count),
      usedProvider: lastUsedProvider,
      usedProviders: [],
      failedProviders: [],
    };
  }

  for (let index = 0; index < order.length; index++) {
    if (args.signal?.aborted) break;
    const cred = order[index];
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
      const comments = await client.generate({
        ...args,
        signal: args.signal
          ? AbortSignal.any([args.signal, AbortSignal.timeout(12000)])
          : AbortSignal.timeout(12000),
        count: args.count - accepted.length,
        previousComments: [
          ...(args.previousComments ?? []),
          ...accepted.map((comment) => comment.isi),
        ],
      }, cred.apiKey, cred.model);
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
      accepted.push(...comments);
      usedProviders.add(cred.provider);
      lastUsedProvider = cred.provider;
      return {
        comments: accepted.slice(0, args.count),
        usedProvider: cred.provider,
        usedProviders: [...usedProviders],
        failedProviders: failed,
      };
    } catch (e) {
      if (e instanceof CommentQualityError) {
        accepted.push(...e.acceptedComments);
        if (e.acceptedComments.length > 0) {
          usedProviders.add(cred.provider);
          lastUsedProvider = cred.provider;
        }
        failed.push({
          provider: cred.provider,
          reason: e.message,
          rateLimited: false,
          retryAfterSec: 0,
          scope: "unknown",
          kind: "quality",
        });
        // Hanya repair jika ada kemajuan; kegagalan API/kuota tetap di-skip.
        if (!repairUsed && e.acceptedComments.length > 0) {
          order.splice(index + 1, 0, cred);
          repairUsed = true;
        }
      } else if (e instanceof ProviderRateLimitError) {
        failed.push({
          provider: cred.provider,
          reason: `${e.message} · ${e.scope}, retry ${e.retryAfterSec}s`,
          rateLimited: true,
          retryAfterSec: e.retryAfterSec,
          scope: e.scope,
        });
      } else if (e instanceof ProviderError) {
        const needsAccountAction = [401, 402, 403, 404].includes(e.status);
        failed.push({
          provider: cred.provider,
          reason: e.message,
          rateLimited: false,
          // 402 berarti key/project meminta billing. Jangan dihantam ulang tiap
          // beberapa menit; beri waktu user memperbaiki akun atau mengganti key.
          retryAfterSec:
            e.status === 402 ? 24 * 60 * 60 : needsAccountAction ? 3600 : 300,
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

  // Deadline dapat habis sebelum provider berikutnya sempat dicoba.
  if (args.signal?.aborted && failed.length === 0) {
    failed.push({
      provider: lastUsedProvider,
      reason: "Batas waktu generate tercapai",
      rateLimited: false,
      retryAfterSec: 30,
      scope: "unknown",
    });
  }
  throw new AllProvidersFailedError(failed, accepted, [...usedProviders]);
}

export * from "./types";
