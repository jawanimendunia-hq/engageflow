import { NextResponse } from "next/server";
import { loadMetaCreds } from "@/lib/meta-creds";
import { searchCampaignsBulk } from "@/lib/meta";

/**
 * GET /api/meta/search-campaign?cred_id=xxx&q=keyword1&q=keyword2
 * Mendukung multi keyword (q bisa berkali-kali).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const credId = searchParams.get("cred_id");
  const queries = searchParams.getAll("q").map((s) => s.trim()).filter(Boolean);

  if (queries.length === 0) {
    return NextResponse.json({ error: "q kosong" }, { status: 400 });
  }

  const ctx = await loadMetaCreds(credId);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  try {
    const campaigns = await searchCampaignsBulk(ctx.token, ctx.adAccountId, queries);
    return NextResponse.json({ data: campaigns });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Meta API gagal" },
      { status: 500 }
    );
  }
}
