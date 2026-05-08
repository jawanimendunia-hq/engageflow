import { createClient } from "@/lib/supabase/server";
import CommentsClient from "./CommentsClient";

export const dynamic = "force-dynamic";

export default async function CommentsPage() {
  const supabase = createClient();
  const { data: comments = [] } = await supabase
    .from("comments")
    .select("*")
    .order("created_at", { ascending: false });

  // ambil usage juga supaya bisa ditampilkan
  const { data: usage = [] } = await supabase.from("comment_usage").select("*");
  const usageMap: Record<string, number> = {};
  for (const u of usage ?? []) usageMap[u.comment_id] = u.jumlah_pakai;

  return <CommentsClient initial={comments ?? []} usageMap={usageMap} />;
}
