import { NextResponse } from "next/server";
import { loadAiCreds } from "@/lib/ai-creds";
import { testGemini } from "@/lib/gemini";

export async function GET() {
  const ctx = await loadAiCreds();
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const result = await testGemini(ctx.apiKey, ctx.model);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true, reply: result.reply, model: ctx.model });
}
