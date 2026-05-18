/**
 * Groq provider — OpenAI-compatible Chat Completions API.
 * Endpoint: https://api.groq.com/openai/v1/chat/completions
 * Free tier: 30 RPM, 14400 token/menit (varies per model)
 *
 * Model gratis populer:
 * - llama-3.3-70b-versatile (kualitas terbaik)
 * - llama-3.1-8b-instant (paling cepat)
 */

import { buildPrompt, parseCommentsJson } from "./prompt";
import {
  ProviderClient,
  ProviderError,
  ProviderRateLimitError,
  type GenerateArgs,
  type GeneratedComment,
} from "./types";

const BASE = "https://api.groq.com/openai/v1/chat/completions";
const NAME = "groq" as const;

export const groq: ProviderClient = {
  name: NAME,
  defaultModel: "llama-3.3-70b-versatile",

  async test(apiKey, model) {
    try {
      const res = await fetch(BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Reply with exactly: PONG" }],
          max_tokens: 10,
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
    const prompt = buildPrompt(args);

    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.95,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
      throw new ProviderRateLimitError(NAME, isNaN(retryAfter) ? 60 : retryAfter);
    }

    const data = await res.json();

    if (res.status === 503 || res.status === 502) {
      throw new ProviderRateLimitError(
        NAME,
        30,
        data?.error?.message ?? "overloaded"
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
    if (!text) {
      throw new ProviderError(NAME, 200, "Response kosong");
    }

    return parseCommentsJson(text);
  },
};
