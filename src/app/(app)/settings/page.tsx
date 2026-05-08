import { createClient } from "@/lib/supabase/server";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();

  const { data: creds = [] } = await supabase
    .from("meta_credentials")
    .select("id, label, ad_account_id, last_used_at, updated_at, created_at")
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true });

  const { data: skus = [] } = await supabase
    .from("sku_mappings")
    .select("*")
    .order("kode", { ascending: true });

  const { data: ai } = await supabase
    .from("ai_credentials")
    .select("id, model, last_used_at, updated_at")
    .eq("provider", "gemini")
    .maybeSingle();

  return (
    <SettingsClient
      initialCreds={creds ?? []}
      initialSkus={skus ?? []}
      aiInitial={
        ai
          ? {
              hasKey: true,
              model: ai.model ?? "gemini-2.5-flash",
              lastUsed: ai.last_used_at,
              updatedAt: ai.updated_at,
            }
          : { hasKey: false, model: "gemini-2.5-flash", lastUsed: null, updatedAt: null }
      }
    />
  );
}

