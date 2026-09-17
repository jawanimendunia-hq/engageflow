/**
 * Groq provider — OpenAI-compatible Chat Completions API.
 * Endpoint: https://api.groq.com/openai/v1/chat/completions
 * Free tier bervariasi per model dan organisasi.
 *
 * Model gratis populer:
 * Model utama: openai/gpt-oss-20b
 */

import { buildPrompt, parseCommentsJson } from "./prompt";
import { outputTokenLimit, readRateLimit } from "./limits";
import {
  ProviderClient,
  ProviderError,
  ProviderRateLimitError,
  type GenerateArgs,
  type GeneratedComment,
} from "./types";

const BASE = "https://api.groq.com/openai/v1/chat/completions";
const NAME = "groq" as const;

export function resolveGroqModel(model: string): string {
  return !model || model === "qwen/qwen3.6-27b"
    ? "openai/gpt-oss-20b"
    : model;
}

export const groq: ProviderClient = {
  name: NAME,
  defaultModel: "openai/gpt-oss-20b",

  async test(apiKey, model) {
    model = resolveGroqModel(model);
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
          max_completion_tokens: 10,
          ...(model.startsWith("qwen/") ? { reasoning_effort: "none" } : {}),
          ...(model.startsWith("openai/gpt-oss-")
            ? { reasoning_effort: "low", include_reasoning: false }
            : {}),
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
    model = resolveGroqModel(model);
    const prompt = buildPrompt(args);

    const res = await fetch(BASE, {
      method: "POST",
      signal: args.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.75,
        max_completion_tokens: outputTokenLimit(args.count),
        response_format: { type: "json_object" },
        ...(model.startsWith("qwen/") ? { reasoning_effort: "none" } : {}),
        ...(model.startsWith("openai/gpt-oss-")
          ? { reasoning_effort: "low", include_reasoning: false }
          : {}),
      }),
    });

    const data = await res.json();

    if (res.status === 429) {
      const limit = readRateLimit(res, data);
      throw new ProviderRateLimitError(
        NAME,
        limit.retryAfterSec,
        limit.scope,
        data?.error?.message ?? data?.message
      );
    }

    if (res.status === 503 || res.status === 502) {
      throw new ProviderRateLimitError(
        NAME,
        30,
        "minute",
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

    return parseCommentsJson(text, args);
  },
};
