import { NextResponse } from "next/server";
import { loadAiCreds } from "@/lib/ai-creds";
import { generateComments, GeminiRateLimitError } from "@/lib/gemini";

/**
 * POST /api/ai/generate
 * Body: { url, kategori, count, ad_name?, campaign_name? }
 * Response: { comments: [{ isi, tone }] } | { error, retry_after_sec? }
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
    return NextResponse.json(
      { error: "count harus 1-30" },
      { status: 400 }
    );
  }

  try {
    const comments = await generateComments({
      apiKey: ctx.apiKey,
      model: ctx.model,
      url,
      kategori,
      count,
      adName: ad_name,
      campaignName: campaign_name,
      primaryText: primary_text,
      headline,
      description,
    });
    return NextResponse.json({ comments });
  } catch (e: any) {
    if (e instanceof GeminiRateLimitError) {
      return NextResponse.json(
        {
          error: "Rate limit",
          retry_after_sec: e.retryAfterSec,
          rate_limited: true,
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: e?.message ?? "Gemini gagal" },
      { status: 500 }
    );
  }
}