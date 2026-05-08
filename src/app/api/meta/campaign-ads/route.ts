import { NextResponse } from "next/server";
import { loadMetaCreds } from "@/lib/meta-creds";
import { getAdsInCampaign } from "@/lib/meta";

export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const credId = searchParams.get("cred_id");
  const campaignId = searchParams.get("campaign_id") ?? "";

  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id wajib" }, { status: 400 });
  }

  const ctx = await loadMetaCreds(credId);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  try {
    const ads = await getAdsInCampaign(ctx.token, campaignId);
    return NextResponse.json({ data: ads });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Meta API gagal" },
      { status: 500 }
    );
  }
}