import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, Play, Link2 } from "lucide-react";
import CampaignDetailClient from "./CampaignDetailClient";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.id)
    .single();
  if (error || !campaign) redirect("/campaigns");

  const { data: links = [] } = await supabase
    .from("links")
    .select("*")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: true });

  // Hitung jumlah assignments yang sudah ada untuk masing-masing link
  const linkIds = (links ?? []).map((l) => l.id);
  let assignmentCounts: Record<string, number> = {};
  if (linkIds.length > 0) {
    const { data: asg = [] } = await supabase
      .from("assignments")
      .select("link_id")
      .in("link_id", linkIds);
    for (const a of asg ?? []) {
      assignmentCounts[a.link_id] = (assignmentCounts[a.link_id] ?? 0) + 1;
    }
  }

  // SKU mappings + cek apakah Meta tersambung (ada minimal 1 credential)
  const { data: skus = [] } = await supabase
    .from("sku_mappings")
    .select("kode, kategori");
  const { count: credCount } = await supabase
    .from("meta_credentials")
    .select("id", { count: "exact", head: true });
  const metaConnected = (credCount ?? 0) > 0;

  // Cek AI Gemini
  const { count: aiCount } = await supabase
    .from("ai_credentials")
    .select("id", { count: "exact", head: true })
    .eq("provider", "gemini");
  const hasAi = (aiCount ?? 0) > 0;

  // Fetch accounts (untuk modal — buildAssignments butuh ini)
  const { data: accounts = [] } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });

  const total = links?.length ?? 0;
  const selesai = (links ?? []).filter((l) => l.status === "selesai").length;
  const proses = (links ?? []).filter((l) => l.status === "proses").length;
  const pending = total - selesai - proses;
  const progress = total === 0 ? 0 : Math.round((selesai / total) * 100);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg mb-4"
      >
        <ArrowLeft className="size-4" /> Semua campaign
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{campaign.nama}</h1>
          <p className="text-sm text-muted mt-1">
            {campaign.komentar_per_link} komentar / link
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/campaigns/${campaign.id}/execute`}
            className="btn-primary"
          >
            <Play className="size-4" /> Mode Eksekusi
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Total link" value={total} />
        <Stat label="Selesai" value={selesai} accent="emerald" />
        <Stat label="Proses" value={proses} accent="blue" />
        <Stat label="Pending" value={pending} accent="yellow" />
      </div>

      <div className="card p-4 mb-8">
        <div className="flex justify-between text-xs text-muted mb-1.5">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-bg-elev rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Link2 className="size-4" /> Link
      </h2>

      <CampaignDetailClient
        campaign={campaign}
        initialLinks={links ?? []}
        assignmentCounts={assignmentCounts}
        skus={skus ?? []}
        metaConnected={metaConnected}
        hasAi={hasAi}
        accounts={accounts ?? []}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "blue" | "yellow";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "blue"
        ? "text-blue-600 dark:text-blue-400"
        : accent === "yellow"
          ? "text-yellow-600 dark:text-yellow-400"
          : "text-fg";
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
