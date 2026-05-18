/**
 * Gemini provider — Google Generative Language API.
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/
 *
 * Catatan: TIDAK pakai URL Context tool (sering blokir di FB ads).
 * Pakai responseMimeType: application/json supaya output JSON murni.
 */

import { buildPrompt, parseCommentsJson } from "./prompt";
import {
  ProviderClient,
  ProviderError,
  ProviderRateLimitError,
  type GenerateArgs,
  type GeneratedComment,
} from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const NAME = "gemini" as const;

export const gemini: ProviderClient = {
  name: NAME,
  defaultModel: "gemini-2.5-flash",

  async test(apiKey, model) {
    try {
      const res = await fetch(
        `${BASE}/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "Reply with exactly: PONG" }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        return {
          ok: false,
          reason: data?.error?.message ?? `HTTP ${res.status}`,
        };
      }
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no text)";
      return { ok: true, reply: text.trim() };
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? "fetch failed" };
    }
  },

  async generate(args: GenerateArgs, apiKey, model): Promise<GeneratedComment[]> {
    const prompt = buildPrompt(args);

    const res = await fetch(
      `${BASE}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.95,
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
      throw new ProviderRateLimitError(NAME, isNaN(retryAfter) ? 60 : retryAfter);
    }

    const data = await res.json();

    // Treat 503 / overloaded sebagai rate-limit-ish supaya orchestrator rotasi
    const errMsg = (data?.error?.message ?? "").toLowerCase();
    const isTransient =
      res.status === 503 ||
      errMsg.includes("high demand") ||
      errMsg.includes("overloaded") ||
      errMsg.includes("temporarily unavailable") ||
      errMsg.includes("try again later");

    if (!res.ok && isTransient) {
      throw new ProviderRateLimitError(NAME, 30, data?.error?.message);
    }

    if (!res.ok) {
      throw new ProviderError(
        NAME,
        res.status,
        data?.error?.message ?? `HTTP ${res.status}`
      );
    }

    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p: any) => p?.text ?? "")
      .filter(Boolean)
      .join("");

    if (!text) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      const blockReason = data?.promptFeedback?.blockReason;
      throw new ProviderError(
        NAME,
        200,
        `Response kosong${finishReason ? ` (finish: ${finishReason})` : ""}${
          blockReason ? ` (block: ${blockReason})` : ""
        }`
      );
    }

    return parseCommentsJson(text);
  },
};
