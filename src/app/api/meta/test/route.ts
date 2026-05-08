import { NextResponse } from "next/server";
import { loadMetaCreds } from "@/lib/meta-creds";
import { testConnection } from "@/lib/meta";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const credId = searchParams.get("cred_id");

  const ctx = await loadMetaCreds(credId);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const result = await testConnection(ctx.token, ctx.adAccountId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, account_name: result.account_name });
}
