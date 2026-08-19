import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import {
  PROVIDERS,
  type ProviderCred,
  type ProviderFailure,
  type ProviderName,
} from "@/lib/ai";

/**
 * Load semua AI credential user yang enabled, terurut by priority ascending.
 * Hasilnya siap dipakai untuk generateWithRotation.
 */
export async function loadAiCreds(): Promise<
  | { error: string; status: number; retryAfterSec?: number }
  | {
      user: { id: string };
      supabase: ReturnType<typeof createClient>;
      creds: ProviderCred[];
      coolingProviders: { provider: ProviderName; retryAfterSec: number }[];
    }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized", status: 401 };

  const { data, error } = await supabase
    .from("ai_credentials")
    .select("*")
    .eq("user_id", user.id)
    .eq("enabled", true)
    .order("priority", { ascending: true });

  if (error) {
    return { error: error.message, status: 500 };
  }

  if (!data || data.length === 0) {
    return {
      error:
        "Belum ada AI provider aktif. Tambah Gemini / Cerebras / Groq di Settings.",
      status: 400,
    };
  }

  const creds: ProviderCred[] = [];
  const decryptErrors: string[] = [];
  const coolingProviders: { provider: ProviderName; retryAfterSec: number }[] = [];
  const now = Date.now();

  for (const row of data) {
    const provider = row.provider as ProviderName;
    if (!PROVIDERS[provider]) continue; // unknown provider

    const cooldownUntil = row.cooldown_until
      ? new Date(row.cooldown_until).getTime()
      : 0;
    if (cooldownUntil > now) {
      coolingProviders.push({
        provider,
        retryAfterSec: Math.max(1, Math.ceil((cooldownUntil - now) / 1000)),
      });
      continue;
    }

    let apiKey: string;
    try {
      apiKey = decrypt(row.api_key_encrypted);
    } catch {
      decryptErrors.push(provider);
      continue;
    }

    creds.push({
      id: row.id,
      provider,
      apiKey,
      model: row.model ?? PROVIDERS[provider].defaultModel,
      priority: row.priority ?? 100,
      enabled: row.enabled,
      lastUsedAt: row.last_used_at ?? null,
    });
  }

  if (creds.length === 0) {
    if (coolingProviders.length > 0) {
      const earliest = Math.min(...coolingProviders.map((p) => p.retryAfterSec));
      return {
        error: `Semua AI provider sedang cooldown. Coba lagi dalam ${earliest} detik.`,
        status: 429,
        retryAfterSec: earliest,
      };
    }
    return {
      error: `Gagal decrypt semua API key${
        decryptErrors.length > 0 ? ` (${decryptErrors.join(", ")})` : ""
      }. ENCRYPTION_KEY mungkin berubah — set ulang di Settings.`,
      status: 500,
    };
  }

  return { user, supabase, creds, coolingProviders };
}

/**
 * Update last_used_at dan pulihkan circuit-breaker provider yang sukses.
 */
export async function markCredentialUsed(credId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("ai_credentials")
    .select("success_count")
    .eq("id", credId)
    .maybeSingle();

  const corePatch = {
    last_used_at: new Date().toISOString(),
    cooldown_until: null,
    last_error: null,
    consecutive_errors: 0,
  };
  const { error } = await supabase
    .from("ai_credentials")
    .update({
      ...corePatch,
      success_count: Number(data?.success_count ?? 0) + 1,
    })
    .eq("id", credId);

  // Tetap kompatibel jika aplikasi ter-deploy sebelum migration statistik.
  if (error) {
    await supabase.from("ai_credentials").update(corePatch).eq("id", credId);
  }
}

/** Simpan circuit-breaker agar request berikutnya tidak menghantam provider gagal. */
export async function markCredentialFailure(
  credId: string,
  failure: ProviderFailure
) {
  const supabase = createClient();
  const { data } = await supabase
    .from("ai_credentials")
    .select("consecutive_errors, failure_count")
    .eq("id", credId)
    .maybeSingle();

  const cooldownUntil = new Date(
    Date.now() + Math.max(1, failure.retryAfterSec) * 1000
  ).toISOString();
  const requiresBilling = failure.reason.includes("[402]");
  const corePatch = {
    cooldown_until: cooldownUntil,
    last_error: failure.reason.slice(0, 1000),
    consecutive_errors: (data?.consecutive_errors ?? 0) + 1,
    ...(requiresBilling ? { enabled: false } : {}),
  };
  const { error } = await supabase
    .from("ai_credentials")
    .update({
      ...corePatch,
      failure_count: Number(data?.failure_count ?? 0) + 1,
      last_failure_at: new Date().toISOString(),
    })
    .eq("id", credId);

  if (error) {
    await supabase.from("ai_credentials").update(corePatch).eq("id", credId);
  }
}
