import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";
import {
  PROVIDERS,
  PROVIDER_DEFAULT_PRIORITY,
  PROVIDER_LIST,
  type ProviderName,
} from "@/lib/ai";

/**
 * POST /api/ai/save
 *   { provider: "gemini"|"cerebras"|"groq", api_key, model?, priority?, enabled? }
 * Validate via provider.test, encrypt, upsert.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    provider,
    api_key,
    model,
    priority,
    enabled,
  } = body as {
    provider?: string;
    api_key?: string;
    model?: string;
    priority?: number;
    enabled?: boolean;
  };

  if (!provider || !PROVIDER_LIST.includes(provider as ProviderName)) {
    return NextResponse.json(
      { error: `provider harus salah satu: ${PROVIDER_LIST.join(", ")}` },
      { status: 400 }
    );
  }

  const providerName = provider as ProviderName;
  const client = PROVIDERS[providerName];

  if (!api_key) {
    return NextResponse.json({ error: "api_key wajib" }, { status: 400 });
  }

  const usedModel = model?.trim() || client.defaultModel;

  const test = await client.test(api_key, usedModel);
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
      provider: providerName,
      api_key_encrypted: encrypted,
      model: usedModel,
      priority: priority ?? PROVIDER_DEFAULT_PRIORITY[providerName],
      enabled: enabled ?? true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, reply: test.reply, provider: providerName });
}

/**
 * PATCH /api/ai/save
 *   { provider, enabled?, priority?, model? } — update tanpa ganti API key
 */
export async function PATCH(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { provider, enabled, priority, model } = body as {
    provider?: string;
    enabled?: boolean;
    priority?: number;
    model?: string;
  };

  if (!provider || !PROVIDER_LIST.includes(provider as ProviderName)) {
    return NextResponse.json({ error: "provider salah" }, { status: 400 });
  }

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof enabled === "boolean") patch.enabled = enabled;
  if (typeof priority === "number") patch.priority = priority;
  if (typeof model === "string" && model.trim()) patch.model = model.trim();

  const { error } = await supabase
    .from("ai_credentials")
    .update(patch)
    .eq("user_id", user.id)
    .eq("provider", provider);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/ai/save?provider=gemini
 */
export async function DELETE(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");

  if (!provider || !PROVIDER_LIST.includes(provider as ProviderName)) {
    return NextResponse.json({ error: "provider param wajib" }, { status: 400 });
  }

  const { error } = await supabase
    .from("ai_credentials")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", provider);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
