import { createClient } from "@/lib/supabase/server";
import SettingsClient, { type AiCredInitial } from "./SettingsClient";
import { PROVIDER_LIST } from "@/lib/ai";

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

  const { data: aiRows = [] } = await supabase
    .from("ai_credentials")
    .select("provider, model, priority, enabled, last_used_at, updated_at")
    .order("priority", { ascending: true });

  // Index by provider
  const byProvider = new Map<string, any>();
  for (const row of aiRows ?? []) byProvider.set(row.provider, row);

  const aiInitial: AiCredInitial[] = PROVIDER_LIST.map((p) => {
    const row = byProvider.get(p);
    return {
      provider: p,
      hasKey: !!row,
      model: row?.model ?? "",
      priority: row?.priority ?? null,
      enabled: row?.enabled ?? true,
      lastUsed: row?.last_used_at ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });

  return (
    <SettingsClient
      initialCreds={creds ?? []}
      initialSkus={skus ?? []}
      aiInitial={aiInitial}
    />
  );
}
