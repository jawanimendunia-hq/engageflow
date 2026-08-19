/**
 * OpenRouter Free Router — jaringan cadangan terakhir.
 * Router memilih model gratis yang sedang tersedia dan mendukung JSON mode.
 */

import { buildPrompt, parseCommentsJson } from "./prompt";
import { outputTokenLimit, readRateLimit } from "./limits";
import {
  ProviderError,
  ProviderRateLimitError,
  type GenerateArgs,
  type GeneratedComment,
  type ProviderClient,
} from "./types";

const BASE = "https://openrouter.ai/api/v1/chat/completions";
const NAME = "openrouter" as const;

function headers(apiKey: string): Record<string, string> {
  const out: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-Title": "EngageFlow",
  };
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) out["HTTP-Referer"] = siteUrl;
  return out;
}

export const openrouter: ProviderClient = {
  name: NAME,
  defaultModel: "openrouter/free",

  async test(apiKey, model) {
    try {
      const res = await fetch(BASE, {
        method: "POST",
        headers: headers(apiKey),
        body: JSON.stringify({
          model: model || "openrouter/free",
          messages: [{ role: "user", content: "Reply with exactly: PONG" }],
          max_tokens: 16,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          ok: false,
          reason: data?.error?.message ?? data?.message ?? `HTTP ${res.status}`,
        };
      }
      const text = data?.choices?.[0]?.message?.content ?? "(no text)";
      return { ok: true, reply: String(text).trim() };
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? "fetch failed" };
    }
  },

  async generate(args: GenerateArgs, apiKey, model): Promise<GeneratedComment[]> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        model: model || "openrouter/free",
        messages: [{ role: "user", content: buildPrompt(args) }],
        temperature: 0.95,
        max_tokens: outputTokenLimit(args.count),
        response_format: { type: "json_object" },
      }),
    });
    const data = await res.json();

    if (res.status === 429) {
      const limit = readRateLimit(res, data, 60 * 60);
      throw new ProviderRateLimitError(
        NAME,
        limit.retryAfterSec,
        limit.scope,
        data?.error?.message ?? data?.message
      );
    }

    if ([502, 503, 504].includes(res.status)) {
      throw new ProviderRateLimitError(
        NAME,
        120,
        "minute",
        data?.error?.message ?? "Free router sementara tidak tersedia"
      );
    }

    if (!res.ok) {
      throw new ProviderError(
        NAME,
        res.status,
        data?.error?.message ?? data?.message ?? `HTTP ${res.status}`
      );
    }

    const text: string = data?.choices?.[0]?.message?.content ?? "";
    if (!text) throw new ProviderError(NAME, 200, "Response kosong");
    return parseCommentsJson(text);
  },
};
