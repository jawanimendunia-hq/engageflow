import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExecuteClient, { type EnrichedAssignment } from "./ExecuteClient";

export const dynamic = "force-dynamic";

export default async function ExecutePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!campaign) redirect("/campaigns");

  const { data: links = [] } = await supabase
    .from("links")
    .select("*")
    .eq("campaign_id", params.id);

  const linkIds = (links ?? []).map((l) => l.id);

  let enriched: EnrichedAssignment[] = [];
  let accounts: { id: string; nama: string }[] = [];

  if (linkIds.length > 0) {
    const { data: asg = [] } = await supabase
      .from("assignments")
      .select("*")
      .in("link_id", linkIds)
      .order("urutan", { ascending: true });

    const accIds = Array.from(new Set((asg ?? []).map((a) => a.account_id)));
    const comIds = Array.from(new Set((asg ?? []).map((a) => a.comment_id)));

    const [accsRes, comsRes] = await Promise.all([
      accIds.length > 0
        ? supabase.from("accounts").select("id, nama, warna").in("id", accIds)
        : Promise.resolve({
            data: [] as { id: string; nama: string; warna: string | null }[],
            error: null,
          }),
      comIds.length > 0
        ? supabase.from("comments").select("id, isi, tone").in("id", comIds)
        : Promise.resolve({
            data: [] as { id: string; isi: string; tone: string }[],
            error: null,
          }),
    ]);

    accounts = accsRes.data ?? [];
    const accMap: Map<
      string,
      { id: string; nama: string; warna: string | null }
    > = new Map((accsRes.data ?? []).map((a) => [a.id, a]));
    const comMap: Map<string, { id: string; isi: string; tone: string }> = new Map(
      (comsRes.data ?? []).map((c) => [c.id, c])
    );
    const linkMap = new Map(
     (links ?? []).map((l) => [l.id, l])
   );

    enriched = (asg ?? []).map((a) => {
      const link = linkMap.get(a.link_id);
      const acc = accMap.get(a.account_id);
      const com = comMap.get(a.comment_id);
      return {
        id: a.id,
        link_id: a.link_id,
        account_id: a.account_id,
        comment_id: a.comment_id,
        status: a.status as "pending" | "selesai",
        urutan: a.urutan,
        link_url: link?.url ?? "",
        link_kategori: link?.kategori ?? "",
        link_status: (link?.status ?? "pending") as
          | "pending"
          | "proses"
          | "selesai",
        account_nama: acc?.nama ?? "(akun terhapus)",
        account_warna: acc?.warna ?? null,
        comment_isi: com?.isi ?? "(komentar terhapus)",
        comment_tone: (com?.tone ?? "santai") as string,
      };
    });
  }

  return (
    <ExecuteClient
      campaignId={params.id}
      campaignName={campaign.nama}
      assignments={enriched}
      accounts={accounts}
    />
  );
}
