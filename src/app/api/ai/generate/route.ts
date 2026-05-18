import { NextResponse } from "next/server";
import { loadAiCreds, markCredentialUsed } from "@/lib/ai-creds";
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
 *   used_provider: "gemini" | "cerebras" | "groq",
 *   failed_providers: [{ provider, reason, rate_limited }]
 * }
 */
export async function POST(req: Request) {
  const ctx = await loadAiCreds();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
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

    // Mark provider yang sukses sebagai last_used
    const usedCred = ctx.creds.find((c) => c.provider === result.usedProvider);
    if (usedCred) markCredentialUsed(usedCred.id);

    return NextResponse.json({
      comments: result.comments,
      used_provider: result.usedProvider,
      used_provider_label: PROVIDER_LABELS[result.usedProvider],
      failed_providers: result.failedProviders.map((f) => ({
        provider: f.provider,
        reason: f.reason,
        rate_limited: f.rateLimited,
      })),
    });
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      // Semua provider gagal — kalau ada yang rate-limited, sinyalkan
      const anyRateLimited = e.failedProviders.some((f) => f.rateLimited);
      return NextResponse.json(
        {
          error: "Semua AI provider gagal / habis limit",
          all_failed: true,
          rate_limited: anyRateLimited,
          failed_providers: e.failedProviders.map((f) => ({
            provider: f.provider,
            reason: f.reason,
            rate_limited: f.rateLimited,
          })),
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: (e as Error)?.message ?? "AI gagal" },
      { status: 500 }
    );
  }
}
