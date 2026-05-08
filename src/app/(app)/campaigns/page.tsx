import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Plus } from "lucide-react";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const supabase = createClient();
  const { data: campaigns = [] } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="p-8 max-w-6xl mx-auto">
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
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="flex items-center justify-between p-4 hover:bg-bg-elev/50 transition-colors"
            >
              <div>
                <div className="font-medium">{c.nama}</div>
                <div className="text-xs text-muted mt-0.5">
                  {c.komentar_per_link} komentar / link · dibuat {fmtDate(c.created_at)}
                </div>
              </div>
              <div className="text-xs text-muted">→</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
