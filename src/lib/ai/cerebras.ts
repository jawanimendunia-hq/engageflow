/**
 * Cerebras provider — OpenAI-compatible Chat Completions API.
 * Endpoint: https://api.cerebras.ai/v1/chat/completions
 * Free tier: ~30 RPM, 14400/hari (varies per model)
 *
 * Model gratis utama: gpt-oss-120b
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

const BASE = "https://api.cerebras.ai/v1/chat/completions";
const NAME = "cerebras" as const;

export const cerebras: ProviderClient = {
  name: NAME,
  defaultModel: "gpt-oss-120b",

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
          max_completion_tokens: 10,
          ...(model === "gpt-oss-120b" ? { reasoning_effort: "low" } : {}),
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
        max_completion_tokens: outputTokenLimit(args.count),
        response_format: { type: "json_object" },
        ...(model === "gpt-oss-120b"
          ? { reasoning_effort: "low", reasoning_format: "hidden" }
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

    return parseCommentsJson(text);
  },
};
