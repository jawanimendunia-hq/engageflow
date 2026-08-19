import { NextResponse } from "next/server";
import {
  loadAiCreds,
  markCredentialFailure,
  markCredentialUsed,
} from "@/lib/ai-creds";
import {
  AllProvidersFailedError,
  generateWithRotation,
  PROVIDER_LABELS,
} from "@/lib/ai";

// Vercel: izinkan request sampai 60 detik. Multi-provider rotation
// biasanya lebih cepat dari single-provider retry (langsung skip).
export const maxDuration = 60;

/**
 * POST /api/ai/generate
 * Body: { url, kategori, count, ad_name?, campaign_name?, primary_text?, headline?, description? }
 * Response: {
 *   comments: [{ isi, tone }],
 *   used_provider: "gemini" | "cerebras" | "groq" | "openrouter",
 *   failed_providers: [{ provider, reason, rate_limited }]
 * }
 */
export async function POST(req: Request) {
  const ctx = await loadAiCreds();
  if ("error" in ctx) {
    return NextResponse.json(
      {
        error: ctx.error,
        rate_limited: ctx.status === 429,
        retry_after_sec: ctx.retryAfterSec,
      },
      { status: ctx.status }
    );
  }

  const body = await req.json().catch(() => ({}));
  const {
    url,
    kategori,
    count,
    ad_name,
    campaign_name,
    primary_text,
    headline,
    description,
  } = body as {
    url?: string;
    kategori?: string;
    count?: number;
    ad_name?: string;
    campaign_name?: string;
    primary_text?: string;
    headline?: string;
    description?: string;
  };

  if (!url || !kategori || !count) {
    return NextResponse.json(
      { error: "url, kategori, count wajib" },
      { status: 400 }
    );
  }

  if (count < 1 || count > 30) {
    return NextResponse.json({ error: "count harus 1-30" }, { status: 400 });
  }

  try {
    const result = await generateWithRotation(ctx.creds, {
      url,
      kategori,
      count,
      adName: ad_name,
      campaignName: campaign_name,
      primaryText: primary_text,
      headline,
      description,
    });

    // Persist circuit-breaker provider gagal dan reset provider yang sukses.
    const usedCred = ctx.creds.find((c) => c.provider === result.usedProvider);
    await Promise.all([
      usedCred ? markCredentialUsed(usedCred.id) : Promise.resolve(),
      ...result.failedProviders.map((failure) => {
        const cred = ctx.creds.find((c) => c.provider === failure.provider);
        return cred
          ? markCredentialFailure(cred.id, failure)
          : Promise.resolve();
      }),
    ]);

    return NextResponse.json({
      comments: result.comments,
      used_provider: result.usedProvider,
      used_provider_label: PROVIDER_LABELS[result.usedProvider],
      failed_providers: result.failedProviders.map((f) => ({
        provider: f.provider,
        reason: f.reason,
        rate_limited: f.rateLimited,
        retry_after_sec: f.retryAfterSec,
        scope: f.scope,
      })),
      cooling_providers: ctx.coolingProviders,
    });
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      await Promise.all(
        e.failedProviders.map((failure) => {
          const cred = ctx.creds.find((c) => c.provider === failure.provider);
          return cred
            ? markCredentialFailure(cred.id, failure)
            : Promise.resolve();
        })
      );
      // Semua provider gagal — kalau ada yang rate-limited, sinyalkan
      const anyRateLimited = e.failedProviders.some((f) => f.rateLimited);
      const retryAfterSec = Math.min(
        ...e.failedProviders.map((f) => f.retryAfterSec)
      );
      return NextResponse.json(
        {
          error: "Semua AI provider gagal / habis limit",
          all_failed: true,
          rate_limited: anyRateLimited,
          retry_after_sec: retryAfterSec,
          failed_providers: e.failedProviders.map((f) => ({
            provider: f.provider,
            reason: f.reason,
            rate_limited: f.rateLimited,
            retry_after_sec: f.retryAfterSec,
            scope: f.scope,
          })),
        },
        { status: anyRateLimited ? 429 : 502 }
      );
    }
    return NextResponse.json(
      { error: (e as Error)?.message ?? "AI gagal" },
      { status: 500 }
    );
  }
}
