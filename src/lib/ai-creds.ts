import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import {
  PROVIDERS,
  type ProviderCred,
  type ProviderName,
} from "@/lib/ai";

/**
 * Load semua AI credential user yang enabled, terurut by priority ascending.
 * Hasilnya siap dipakai untuk generateWithRotation.
 */
export async function loadAiCreds(): Promise<
  | { error: string; status: number }
  | {
      user: { id: string };
      supabase: ReturnType<typeof createClient>;
      creds: ProviderCred[];
    }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized", status: 401 };

  const { data, error } = await supabase
    .from("ai_credentials")
    .select("id, provider, api_key_encrypted, model, priority, enabled")
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

  for (const row of data) {
    const provider = row.provider as ProviderName;
    if (!PROVIDERS[provider]) continue; // unknown provider

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
    });
  }

  if (creds.length === 0) {
    return {
      error: `Gagal decrypt semua API key${
        decryptErrors.length > 0 ? ` (${decryptErrors.join(", ")})` : ""
      }. ENCRYPTION_KEY mungkin berubah — set ulang di Settings.`,
      status: 500,
    };
  }

  return { user, supabase, creds };
}

/**
 * Update last_used_at untuk provider tertentu (fire-and-forget).
 */
export function markCredentialUsed(credId: string) {
  const supabase = createClient();
  supabase
    .from("ai_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", credId)
    .then(() => {});
}
