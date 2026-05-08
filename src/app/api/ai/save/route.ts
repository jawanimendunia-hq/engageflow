import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import { testGemini } from "@/lib/gemini";

/**
 * POST /api/ai/save
 *   { api_key, model? }
 * Validate via testGemini, encrypt, upsert.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { api_key, model } = body as { api_key?: string; model?: string };

  if (!api_key) {
    return NextResponse.json({ error: "api_key wajib" }, { status: 400 });
  }

  const usedModel = model?.trim() || "gemini-2.5-flash";

  const test = await testGemini(api_key, usedModel);
  if (!test.ok) {
    return NextResponse.json(
      { error: `API key / model tidak valid: ${test.reason}` },
      { status: 400 }
    );
  }

  let encrypted: string;
  try {
    encrypted = encrypt(api_key);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Encryption gagal" },
      { status: 500 }
    );
  }

  const { error } = await supabase.from("ai_credentials").upsert(
    {
      user_id: user.id,
      provider: "gemini",
      api_key_encrypted: encrypted,
      model: usedModel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, reply: test.reply });
}

export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("ai_credentials")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "gemini");
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
