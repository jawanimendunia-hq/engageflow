import { createClient } from "@/lib/supabase/server";
import AccountsClient from "./AccountsClient";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const supabase = createClient();
  const { data: accounts = [] } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });
  return <AccountsClient initial={accounts ?? []} />;
}
