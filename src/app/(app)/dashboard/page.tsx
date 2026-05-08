import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Megaphone,
  Plus,
  Link2,
  MessageSquare,
  Users,
  TrendingUp,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { colorOf } from "@/lib/colors";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Paralel fetch
  const [campaignsRes, accountsRes, commentsRes] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, nama, komentar_per_link, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("accounts")
      .select("id, nama, warna")
      .order("created_at", { ascending: true }),
    supabase.from("comments").select("id, kategori"),
  ]);
  const campaigns = campaignsRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const comments = commentsRes.data ?? [];

  // Stats per campaign
  const campaignStats = await Promise.all(
    campaigns.map(async (c) => {
      const { data: links = [] } = await supabase
        .from("links")
        .select("id, status")
        .eq("campaign_id", c.id);
      const total = links?.length ?? 0;
      const selesai = (links ?? []).filter((l) => l.status === "selesai").length;
      const proses = (links ?? []).filter((l) => l.status === "proses").length;
      const totalKomentar = total * c.komentar_per_link;
      const progress = total === 0 ? 0 : Math.round((selesai / total) * 100);
      return {
        ...c,
        totalLink: total,
        totalKomentar,
        selesai,
        proses,
        pending: total - selesai - proses,
        progress,
      };
    })
  );

  // Pending assignments per akun (untuk panel "Antrian per akun")
  let pendingByAccount: Record<string, number> = {};
  if (campaigns.length > 0 && accounts.length > 0) {
    const campIds = campaigns.map((c) => c.id);
    const { data: links = [] } = await supabase
      .from("links")
      .select("id")
      .in("campaign_id", campIds);
    const linkIds = (links ?? []).map((l) => l.id);
    if (linkIds.length > 0) {
      const { data: asgs = [] } = await supabase
        .from("assignments")
        .select("account_id, status")
        .in("link_id", linkIds);
      for (const a of asgs ?? []) {
        if (a.status === "pending") {
          pendingByAccount[a.account_id] =
            (pendingByAccount[a.account_id] ?? 0) + 1;
        }
      }
    }
  }

  // Komentar per kategori (untuk panel kategori)
  const kategoriCount = new Map<string, number>();
  for (const c of comments) {
    kategoriCount.set(c.kategori, (kategoriCount.get(c.kategori) ?? 0) + 1);
  }
  const kategoriList = Array.from(kategoriCount.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  const grandTotalLink = campaignStats.reduce((s, c) => s + c.totalLink, 0);
  const grandTotalKomentar = campaignStats.reduce(
    (s, c) => s + c.totalKomentar,
    0
  );
  const grandSelesai = campaignStats.reduce((s, c) => s + c.selesai, 0);
  const grandProgress =
    grandTotalLink === 0
      ? 0
      : Math.round((grandSelesai / grandTotalLink) * 100);

  const totalPendingAccounts = Object.values(pendingByAccount).reduce(
    (s, v) => s + v,
    0
  );

  const userName = user?.email?.split("@")[0] ?? "kamu";

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      {/* Welcome header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="text-sm text-muted mb-1">Selamat datang</div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Halo, <span className="text-accent">{userName}</span> 👋
          </h1>
          <p className="text-sm text-muted mt-2 max-w-lg">
            Ringkasan workspace kamu — campaign aktif, antrian per akun, dan
            stok komentar per kategori.
          </p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">
          <Plus className="size-4" /> Campaign baru
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={Megaphone}
          label="Campaign"
          value={campaigns.length}
          tone="violet"
        />
        <StatCard
          icon={Link2}
          label="Total link"
          value={grandTotalLink}
          tone="blue"
        />
        <StatCard
          icon={MessageSquare}
          label="Total komentar"
          value={grandTotalKomentar}
          tone="emerald"
        />
        <StatCard
          icon={TrendingUp}
          label="Progress global"
          value={`${grandProgress}%`}
          tone="amber"
          extra={
            <div className="mt-3 h-1.5 bg-bg-elev rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${grandProgress}%` }}
              />
            </div>
          }
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Campaign progress (lebih besar, kiri) */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold">Progress per campaign</h2>
              <p className="text-xs text-muted mt-0.5">
                Persentase link yang sudah selesai
              </p>
            </div>
            <Link
              href="/campaigns"
              className="text-xs text-muted hover:text-fg flex items-center gap-1"
            >
              Lihat semua <ArrowRight className="size-3" />
            </Link>
          </div>

          {campaignStats.length === 0 ? (
            <div className="py-12 text-center">
              <Megaphone className="size-8 text-muted mx-auto mb-3" />
              <p className="text-sm text-muted mb-3">Belum ada campaign</p>
              <Link
                href="/campaigns/new"
                className="btn-primary inline-flex"
              >
                <Plus className="size-4" /> Campaign pertama
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {campaignStats.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="block group"
                >
                  <div className="flex items-baseline justify-between mb-1.5 gap-2">
                    <div className="font-medium text-sm truncate group-hover:text-accent transition-colors">
                      {c.nama}
                    </div>
                    <div className="text-xs text-muted shrink-0 tabular-nums">
                      {c.selesai}/{c.totalLink}
                      <span className="ml-2 text-fg font-semibold">
                        {c.progress}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-bg-elev rounded-full overflow-hidden flex">
                    {/* selesai */}
                    {c.totalLink > 0 && (
                      <>
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{
                            width: `${(c.selesai / c.totalLink) * 100}%`,
                          }}
                        />
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{
                            width: `${(c.proses / c.totalLink) * 100}%`,
                          }}
                        />
                      </>
                    )}
                  </div>
                </Link>
              ))}
              {campaignStats.length > 6 && (
                <Link
                  href="/campaigns"
                  className="block text-center text-xs text-accent hover:underline pt-2"
                >
                  + {campaignStats.length - 6} campaign lainnya
                </Link>
              )}
            </div>
          )}

          {/* Legend */}
          {campaignStats.length > 0 && (
            <div className="flex items-center gap-4 mt-5 pt-4 border-t border-border text-xs text-muted">
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-emerald-500" /> Selesai
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-blue-500" /> Proses
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-bg-elev border border-border" />{" "}
                Pending
              </div>
            </div>
          )}
        </div>

        {/* Antrian per akun (kanan) */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Users className="size-4" /> Antrian per akun
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {totalPendingAccounts} tugas tersisa total
              </p>
            </div>
            <Link
              href="/accounts"
              className="text-xs text-muted hover:text-fg"
            >
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {accounts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-muted mb-3">Belum ada akun</p>
              <Link
                href="/accounts"
                className="btn-secondary inline-flex text-xs"
              >
                <Plus className="size-3" /> Tambah akun
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.slice(0, 6).map((a) => {
                const count = pendingByAccount[a.id] ?? 0;
                const c = colorOf(a.warna);
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-elev transition-colors"
                  >
                    <div
                      className="size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                      style={{
                        background: c ? `${c.hex}22` : "rgb(var(--bg-elev))",
                        color: c?.ring ?? "rgb(var(--fg-muted))",
                        border: c ? `1px solid ${c.hex}55` : undefined,
                      }}
                    >
                      {a.nama[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {a.nama}
                      </div>
                      <div className="text-[10px] text-muted">
                        {count > 0 ? `${count} tugas pending` : "kosong"}
                      </div>
                    </div>
                    {count > 0 && (
                      <div className="text-base font-bold text-accent tabular-nums shrink-0">
                        {count}
                      </div>
                    )}
                  </div>
                );
              })}
              {accounts.length > 6 && (
                <Link
                  href="/accounts"
                  className="block text-center text-xs text-accent hover:underline pt-2"
                >
                  + {accounts.length - 6} akun
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: kategori + recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stok komentar per kategori */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="size-4" /> Stok komentar
            </h2>
            <Link
              href="/comments"
              className="text-xs text-muted hover:text-fg"
            >
              <ArrowRight className="size-3" />
            </Link>
          </div>
          {kategoriList.length === 0 ? (
            <p className="text-xs text-muted">Belum ada komentar</p>
          ) : (
            <div className="space-y-2">
              {kategoriList.slice(0, 6).map(([kat, count]) => {
                const max = kategoriList[0][1];
                const pct = (count / max) * 100;
                return (
                  <div key={kat}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{kat}</span>
                      <span className="text-muted tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 bg-bg-elev rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent campaigns */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Campaign terbaru</h2>
            <Link
              href="/campaigns"
              className="text-xs text-muted hover:text-fg"
            >
              <ArrowRight className="size-3" />
            </Link>
          </div>
          {campaignStats.length === 0 ? (
            <p className="text-xs text-muted">Belum ada campaign</p>
          ) : (
            <div className="divide-y divide-border -my-2">
              {campaignStats.slice(0, 4).map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="flex items-center gap-3 py-3 hover:bg-bg-elev/50 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="size-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Megaphone className="size-4 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{c.nama}</div>
                    <div className="text-[11px] text-muted">
                      {fmtDate(c.created_at)} · {c.totalLink} link ·{" "}
                      {c.komentar_per_link}/link
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold tabular-nums">
                      {c.progress}%
                    </div>
                    <div className="text-[10px] text-muted">
                      {c.selesai}/{c.totalLink}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  extra,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: "violet" | "blue" | "emerald" | "amber";
  extra?: React.ReactNode;
}) {
  const toneClass = {
    violet: "bg-violet-500/10 text-violet-500",
    blue: "bg-blue-500/10 text-blue-500",
    emerald: "bg-emerald-500/10 text-emerald-500",
    amber: "bg-amber-500/10 text-amber-500",
  }[tone];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-muted">{label}</div>
        <div
          className={`size-8 rounded-lg flex items-center justify-center ${toneClass}`}
        >
          <Icon className="size-4" />
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {extra}
    </div>
  );
}
