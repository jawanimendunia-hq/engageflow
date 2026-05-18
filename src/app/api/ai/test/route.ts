import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { PROVIDERS, PROVIDER_LIST, type ProviderName } from "@/lib/ai";

/**
 * GET /api/ai/test?provider=gemini
 * Test credential yang tersimpan untuk provider tertentu.
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");

  if (!provider || !PROVIDER_LIST.includes(provider as ProviderName)) {
    return NextResponse.json(
      { error: `provider param wajib: ${PROVIDER_LIST.join(", ")}` },
      { status: 400 }
    );
  }

  const providerName = provider as ProviderName;
  const client = PROVIDERS[providerName];

  const { data, error } = await supabase
    .from("ai_credentials")
    .select("api_key_encrypted, model")
    .eq("user_id", user.id)
    .eq("provider", providerName)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: `Credential ${providerName} belum di-set.` },
      { status: 400 }
    );
  }

  let apiKey: string;
  try {
    apiKey = decrypt(data.api_key_encrypted);
  } catch {
    return NextResponse.json(
      { error: "Gagal decrypt API key. ENCRYPTION_KEY mungkin berubah." },
      { status: 500 }
    );
  }

  const result = await client.test(apiKey, data.model ?? client.defaultModel);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    reply: result.reply,
    model: data.model,
    provider: providerName,
  });
}
