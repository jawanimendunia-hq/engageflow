import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Plus } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import DeleteCampaignButton from "./DeleteCampaignButton";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const supabase = createClient();
  const { data: campaigns = [] } = await supabase
    .from("campaigns")
    .select("*, links(status)")
    .order("created_at", { ascending: false });

  return (
    <div className="page-shell">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaign</h1>
          <p className="text-sm text-muted mt-1">
            Setiap campaign menampung sekumpulan link untuk dieksekusi
          </p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">
          <Plus className="size-4" /> Campaign baru
        </Link>
      </div>

      {(!campaigns || campaigns.length === 0) ? (
        <div className="card p-10 text-center">
          <p className="text-muted">Belum ada campaign.</p>
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {campaigns.map((c) => {
            const totalLinks = c.links?.length ?? 0;
            const completedLinks =
              c.links?.filter(
                (link: { status: string }) => link.status === "selesai"
              ).length ?? 0;
            const completed = totalLinks > 0 && completedLinks === totalLinks;

            return (
              <div
                key={c.id}
                className="flex items-center gap-2 pr-3 hover:bg-bg-elev/50 transition-colors"
              >
                <Link
                  href={`/campaigns/${c.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between p-4"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.nama}</div>
                    <div className="text-xs text-muted mt-0.5">
                      {c.komentar_per_link} komentar / link · {completedLinks}/
                      {totalLinks} link selesai · diubah{" "}
                      {fmtDate(c.updated_at ?? c.created_at)}
                    </div>
                    {c.catatan && (
                      <div className="text-xs text-muted mt-1 truncate">
                        Catatan: {c.catatan}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    {completed && (
                      <span className="badge status-selesai">selesai</span>
                    )}
                    <span className="text-xs text-muted">→</span>
                  </div>
                </Link>
                <DeleteCampaignButton
                  campaignId={c.id}
                  campaignName={c.nama}
                  compact
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
