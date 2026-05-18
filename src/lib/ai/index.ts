/**
 * AI Orchestrator — pilih provider berdasar priority, rotasi saat
 * rate limit / error. Langsung skip ke provider berikutnya (no retry).
 *
 * Usage:
 *   import { generateWithRotation, PROVIDERS } from "@/lib/ai";
 *   const result = await generateWithRotation(creds, args);
 */

import { cerebras } from "./cerebras";
import { gemini } from "./gemini";
import { groq } from "./groq";
import {
  ProviderError,
  ProviderRateLimitError,
  type GenerateArgs,
  type GeneratedComment,
  type ProviderClient,
  type ProviderCred,
  type ProviderName,
} from "./types";

export const PROVIDERS: Record<ProviderName, ProviderClient> = {
  gemini,
  cerebras,
  groq,
};

export const PROVIDER_LIST: ProviderName[] = ["gemini", "cerebras", "groq"];

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  gemini: "Google Gemini",
  cerebras: "Cerebras",
  groq: "Groq",
};

export const PROVIDER_DEFAULT_PRIORITY: Record<ProviderName, number> = {
  gemini: 10,
  cerebras: 20,
  groq: 30,
};

export const PROVIDER_MODEL_OPTIONS: Record<
  ProviderName,
  { value: string; label: string }[]
> = {
  gemini: [
    {
      value: "gemini-2.5-flash",
      label: "gemini-2.5-flash (15 RPM, 1500/hari) — direkomendasikan",
    },
    {
      value: "gemini-2.5-flash-lite",
      label: "gemini-2.5-flash-lite (lebih cepat, kualitas lebih rendah)",
    },
    {
      value: "gemini-2.5-pro",
      label: "gemini-2.5-pro (kualitas terbaik, 2 RPM, 50/hari)",
    },
  ],
  cerebras: [
    {
      value: "llama-3.3-70b",
      label: "llama-3.3-70b (kualitas tinggi, ~30 RPM)",
    },
    {
      value: "llama3.1-8b",
      label: "llama3.1-8b (super cepat, kualitas standar)",
    },
    {
      value: "qwen-3-32b",
      label: "qwen-3-32b (alternatif)",
    },
  ],
  groq: [
    {
      value: "llama-3.3-70b-versatile",
      label: "llama-3.3-70b-versatile (kualitas tinggi, 30 RPM)",
    },
    {
      value: "llama-3.1-8b-instant",
      label: "llama-3.1-8b-instant (paling cepat)",
    },
    {
      value: "openai/gpt-oss-120b",
      label: "openai/gpt-oss-120b (alternatif)",
    },
  ],
};

export interface RotationResult {
  comments: GeneratedComment[];
  /** Provider yang sukses dipakai */
  usedProvider: ProviderName;
  /** Provider yang dicoba tapi gagal — untuk logging / UI */
  failedProviders: { provider: ProviderName; reason: string; rateLimited: boolean }[];
}

export class AllProvidersFailedError extends Error {
  constructor(
    public failedProviders: { provider: ProviderName; reason: string; rateLimited: boolean }[]
  ) {
    const summary = failedProviders
      .map((f) => `${f.provider}: ${f.reason}`)
      .join(" | ");
    super(`Semua AI provider gagal. ${summary}`);
  }
}

/**
 * Coba generate dari provider pertama (priority terkecil),
 * kalau rate limit / error langsung pindah ke provider berikutnya.
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

  for (const cred of creds) {
    const client = PROVIDERS[cred.provider];
    if (!client) {
      failed.push({
        provider: cred.provider,
        reason: "Unknown provider",
        rateLimited: false,
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
          reason: `Rate limit (retry ${e.retryAfterSec}s)`,
          rateLimited: true,
        });
      } else if (e instanceof ProviderError) {
        failed.push({
          provider: cred.provider,
          reason: e.message,
          rateLimited: false,
        });
      } else {
        failed.push({
          provider: cred.provider,
          reason: (e as Error)?.message ?? "Unknown error",
          rateLimited: false,
        });
      }
      // Lanjut ke provider berikutnya
      continue;
    }
  }

  throw new AllProvidersFailedError(failed);
}

export * from "./types";
