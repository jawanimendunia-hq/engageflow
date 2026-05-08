import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";

/**
 * Load credential Meta untuk user.
 * Jika credId diberikan → ambil yang specific.
 * Jika tidak → ambil yang last_used_at paling baru, fallback ke yang created paling lama.
 */
export async function loadMetaCreds(credId?: string | null) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" as const, status: 401 };

  let query = supabase
    .from("meta_credentials")
    .select("id, access_token_encrypted, ad_account_id, label")
    .eq("user_id", user.id);

  if (credId) {
    query = query.eq("id", credId);
  }

  const { data, error } = await query
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      error:
        "Credential Meta tidak ditemukan. Tambah dulu di Settings." as const,
      status: 400,
    };
  }

  let token: string;
  try {
    token = decrypt(data.access_token_encrypted);
  } catch (e) {
    return {
      error:
        "Gagal decrypt token. ENCRYPTION_KEY mungkin berubah — set ulang token di Settings." as const,
      status: 500,
    };
  }

  // update last_used_at (fire and forget)
  supabase
    .from("meta_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  return {
    user,
    supabase,
    credId: data.id,
    token,
    adAccountId: data.ad_account_id,
    label: data.label,
  };
}
