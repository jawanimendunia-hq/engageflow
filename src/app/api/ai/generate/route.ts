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
  type ProviderCred,
  type ProviderFailure,
  type ProviderName,
} from "@/lib/ai";
import { validatePartialComments } from "@/lib/ai/prompt";

// Vercel: izinkan request sampai 60 detik. Multi-provider rotation
// biasanya lebih cepat dari single-provider retry (langsung skip).
export const maxDuration = 60;

async function persistOutcome(
  creds: ProviderCred[],
  usedProviders: ProviderName[],
  failures: ProviderFailure[]
) {
  const actualFailures = failures.filter((failure) => failure.kind !== "quality");
  // Jika satu provider memberi hasil parsial lalu kena kuota saat repair,
  // simpan cooldown-nya. Jangan balapan reset-success dengan update-failure.
  const successes = usedProviders.filter((provider) =>
    !actualFailures.some((failure) => failure.provider === provider)
  );
  await Promise.all([
    ...successes.map((provider) => {
      const cred = creds.find((item) => item.provider === provider);
      return cred ? markCredentialUsed(cred.id, cred.model) : Promise.resolve();
    }),
    ...actualFailures.map((failure) => {
      const cred = creds.find((item) => item.provider === failure.provider);
      return cred ? markCredentialFailure(cred.id, failure) : Promise.resolve();
    }),
  ]);
}

/**
 * POST /api/ai/generate
 * Body: { url, kategori, count, ad_name?, campaign_name?, primary_text?, headline?, description?, avoid_comments?, partial_comments? }
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
    avoid_comments,
    partial_comments,
  } = body as {
    url?: string;
    kategori?: string;
    count?: number;
    ad_name?: string;
    campaign_name?: string;
    primary_text?: string;
    headline?: string;
    description?: string;
    avoid_comments?: unknown;
    partial_comments?: unknown;
  };

  const requestedCount = Number(count);
  if (
    typeof url !== "string" ||
    typeof kategori !== "string" ||
    !url.trim() ||
    !kategori.trim() ||
    !Number.isInteger(requestedCount)
  ) {
    return NextResponse.json(
      { error: "url, kategori, count wajib" },
      { status: 400 }
    );
  }

  if (requestedCount < 1 || requestedCount > 30) {
    return NextResponse.json({ error: "count harus 1-30" }, { status: 400 });
  }

  const previousComments = Array.isArray(avoid_comments)
    ? avoid_comments
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().slice(0, 160))
        .filter(Boolean)
        .slice(-24)
    : [];

  // Hasil parsial dari browser tetap harus melewati quality gate di server.
  const partialComments = validatePartialComments(partial_comments, {
    count: requestedCount, previousComments,
  });

  try {
    const result = await generateWithRotation(ctx.creds, {
      url: url.trim(),
      kategori: kategori.trim(),
      count: requestedCount,
      adName: ad_name,
      campaignName: campaign_name,
      primaryText: primary_text,
      headline,
      description,
      previousComments,
      partialComments,
      signal: AbortSignal.timeout(45000),
    });

    // Persist circuit-breaker provider gagal dan reset provider yang sukses.
    await persistOutcome(ctx.creds, result.usedProviders, result.failedProviders);

    return NextResponse.json({
      comments: result.comments,
      used_provider: result.usedProvider,
      used_provider_label: result.usedProviders.length > 0
        ? result.usedProviders.map((provider) => PROVIDER_LABELS[provider]).join(" + ")
        : "Hasil percobaan sebelumnya",
      used_providers: result.usedProviders,
      failed_providers: result.failedProviders.map((f) => ({
        provider: f.provider,
        reason: f.reason,
        rate_limited: f.rateLimited,
        retry_after_sec: f.retryAfterSec,
        scope: f.scope,
        kind: f.kind,
      })),
      cooling_providers: ctx.coolingProviders,
    });
  } catch (e) {
    if (e instanceof AllProvidersFailedError) {
      await persistOutcome(ctx.creds, e.usedProviders, e.failedProviders);
      // Semua provider gagal — kalau ada yang rate-limited, sinyalkan
      const anyRateLimited = e.failedProviders.some((f) => f.rateLimited);
      const rateLimits = e.failedProviders.filter((f) => f.rateLimited);
      const retryAfterSec = rateLimits.length > 0
        ? Math.min(...rateLimits.map((f) => f.retryAfterSec))
        : 0;
      return NextResponse.json(
        {
          error: `Generate belum lengkap: ${e.partialComments.length}/${requestedCount} komentar lolos. Cek detail provider.`,
          all_failed: true,
          rate_limited: anyRateLimited,
          retry_after_sec: retryAfterSec,
          partial_comments: e.partialComments,
          partial_count: e.partialComments.length,
          failed_providers: e.failedProviders.map((f) => ({
            provider: f.provider,
            reason: f.reason,
            rate_limited: f.rateLimited,
            retry_after_sec: f.retryAfterSec,
            scope: f.scope,
            kind: f.kind,
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
