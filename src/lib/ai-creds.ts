import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

export async function loadAiCreds(provider: "gemini" = "gemini") {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" as const, status: 401 };

  const { data, error } = await supabase
    .from("ai_credentials")
    .select("id, api_key_encrypted, model")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data) {
    return {
      error:
        "Credential AI belum di-set. Tambah API key Gemini di Settings." as const,
      status: 400,
    };
  }

  let apiKey: string;
  try {
    apiKey = decrypt(data.api_key_encrypted);
  } catch {
    return {
      error:
        "Gagal decrypt API key. ENCRYPTION_KEY mungkin berubah — set ulang key di Settings." as const,
      status: 500,
    };
  }

  // update last_used_at fire-and-forget
  supabase
    .from("ai_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return {
    user,
    supabase,
    apiKey,
    model: data.model ?? "gemini-2.5-flash",
  };
}
