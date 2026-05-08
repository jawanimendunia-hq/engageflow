"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Wand2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Account, Campaign, LinkRow } from "@/lib/types";
import { parseBulkLinks, cn } from "@/lib/utils";
import { buildAssignments } from "@/lib/assignment";
import MetaImportModal from "./MetaImportModal";

interface Props {
  campaign: Campaign;
  initialLinks: LinkRow[];
  assignmentCounts: Record<string, number>;
  skus: { kode: string; kategori: string }[];
  metaConnected: boolean;
  hasAi: boolean;
  accounts: Account[];
}

export default function CampaignDetailClient({
  campaign,
  initialLinks,
  assignmentCounts,
  skus,
  metaConnected,
  hasAi,
  accounts,
}: Props) {
  const router = useRouter();
  const [links, setLinks] = useState<LinkRow[]>(initialLinks);
  const [counts, setCounts] = useState(assignmentCounts);
  const [showAdd, setShowAdd] = useState(initialLinks.length === 0);
  const [showMeta, setShowMeta] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [singleUrl, setSingleUrl] = useState("");
  const [singleKat, setSingleKat] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );
  const [, startTransition] = useTransition();

  function notify(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function addBulk() {
    const parsed = parseBulkLinks(bulkText);
    if (parsed.length === 0) {
      notify("err", "Tidak ada link valid. Cek format input.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const rows = parsed.map((p) => ({
      campaign_id: campaign.id,
      url: p.url,
      kategori: p.kategori,
      status: "pending" as const,
    }));
    const { data, error } = await supabase.from("links").insert(rows).select();
    setBusy(false);
    if (error) {
      notify("err", error.message);
      return;
    }
    setLinks((prev) => [...prev, ...(data ?? [])]);
    setBulkText("");
    notify("ok", `${data?.length ?? 0} link ditambahkan`);
  }

  async function addSingle() {
    if (!singleUrl || !singleKat) {
      notify("err", "URL dan kategori wajib diisi");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("links")
      .insert({
        campaign_id: campaign.id,
        url: singleUrl,
        kategori: singleKat,
      })
      .select()
      .single();
    setBusy(false);
    if (error) {
      notify("err", error.message);
      return;
    }
    setLinks((prev) => [...prev, data]);
    setSingleUrl("");
    setSingleKat("");
    notify("ok", "Link ditambahkan");
  }

  async function removeLink(id: string) {
    if (!confirm("Hapus link ini? Assignment-nya juga akan dihapus.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("links").delete().eq("id", id);
    if (error) {
      notify("err", error.message);
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== id));
    notify("ok", "Link dihapus");
  }

  async function runAssignment() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      notify("err", "Sesi habis");
      return;
    }

    // Ambil semua data yang dibutuhkan engine
    const [accountsRes, commentsRes, usageRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", user.id),
      supabase.from("comments").select("*").eq("user_id", user.id),
      supabase.from("comment_usage").select("*"),
    ]);

    if (accountsRes.error || commentsRes.error || usageRes.error) {
      setBusy(false);
      notify(
        "err",
        accountsRes.error?.message ||
          commentsRes.error?.message ||
          usageRes.error?.message ||
          "Gagal memuat data"
      );
      return;
    }

    const usageMap = new Map<string, number>();
    for (const u of usageRes.data ?? []) {
      usageMap.set(u.comment_id, u.jumlah_pakai);
    }

    // Hanya assign untuk link yang BELUM punya assignment
    const linksToAssign = links.filter((l) => (counts[l.id] ?? 0) === 0);
    if (linksToAssign.length === 0) {
      setBusy(false);
      notify("err", "Semua link sudah memiliki assignment.");
      return;
    }

    const result = buildAssignments({
      links: linksToAssign,
      accounts: accountsRes.data ?? [],
      comments: commentsRes.data ?? [],
      usage: usageMap,
      perLink: campaign.komentar_per_link,
    });

    if (result.assignments.length === 0) {
      setBusy(false);
      notify(
        "err",
        result.warnings[0]?.reason ??
          "Tidak ada assignment yang bisa dibuat. Cek akun & komentar per kategori."
      );
      return;
    }

    // Insert assignments
    const insertRows = result.assignments.map((a) => ({
      link_id: a.link_id,
      account_id: a.account_id,
      comment_id: a.comment_id,
      urutan: a.urutan,
    }));
    const { error: insErr } = await supabase
      .from("assignments")
      .insert(insertRows);
    if (insErr) {
      setBusy(false);
      notify("err", insErr.message);
      return;
    }

    // Upsert comment_usage berdasar updatedUsage
    const upserts = Array.from(result.updatedUsage.entries()).map(
      ([comment_id, jumlah_pakai]) => ({ comment_id, jumlah_pakai })
    );
    if (upserts.length > 0) {
      await supabase
        .from("comment_usage")
        .upsert(upserts, { onConflict: "comment_id" });
    }

    // Update local counts state
    const nextCounts = { ...counts };
    for (const a of result.assignments) {
      nextCounts[a.link_id] = (nextCounts[a.link_id] ?? 0) + 1;
    }
    setCounts(nextCounts);
    setBusy(false);

    const okLinks = new Set(result.assignments.map((a) => a.link_id)).size;
    const warn = result.warnings.length;
    notify(
      "ok",
      `${okLinks} link berhasil di-assign${
        warn > 0 ? `, ${warn} link diabaikan (lihat warning di console)` : ""
      }`
    );
    if (warn > 0) console.warn("Assignment warnings:", result.warnings);

    startTransition(() => router.refresh());
  }

  const totalAsg = Object.values(counts).reduce((s, v) => s + v, 0);
  const linksWithoutAsg = links.filter((l) => (counts[l.id] ?? 0) === 0).length;

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={cn(
            "flex items-center gap-2 text-sm rounded-md px-3 py-2 border",
            msg.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20"
              : "bg-red-500/10 text-red-300 border-red-500/20"
          )}
        >
          {msg.kind === "ok" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          {msg.text}
        </div>
      )}

      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted">
          {totalAsg} assignment ·{" "}
          <span className={linksWithoutAsg > 0 ? "text-yellow-600 dark:text-yellow-400" : ""}>
            {linksWithoutAsg} link belum di-assign
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {metaConnected ? (
            <button
              onClick={() => setShowMeta(true)}
              className="btn-secondary"
              title="Import link dari Meta Ads"
            >
              <Sparkles className="size-4" /> Import Meta
            </button>
          ) : (
            <Link
              href="/settings"
              className="btn-ghost text-xs"
              title="Setup integrasi Meta Ads di Settings"
            >
              <Sparkles className="size-3.5" /> Setup Meta
            </Link>
          )}
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="btn-secondary"
          >
            <Plus className="size-4" /> Tambah link
          </button>
          <button
            onClick={runAssignment}
            disabled={busy || links.length === 0 || linksWithoutAsg === 0}
            className="btn-primary"
            title="Jalankan mesin assignment untuk link yang belum di-assign"
          >
            <Wand2 className="size-4" />
            {busy ? "Memproses..." : "Generate Assignment"}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card p-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold mb-2">Tambah satu link</h3>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-2">
              <input
                className="input"
                placeholder="https://..."
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
              />
              <input
                className="input"
                placeholder="kategori (mis. kacamata)"
                value={singleKat}
                onChange={(e) => setSingleKat(e.target.value)}
              />
              <button
                onClick={addSingle}
                disabled={busy}
                className="btn-secondary"
              >
                Tambah
              </button>
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <h3 className="text-sm font-semibold mb-1">Bulk import</h3>
            <p className="text-xs text-muted mb-2">
              Format per baris:{" "}
              <code className="text-fg">URL | kategori</code> atau{" "}
              <code className="text-fg">URL,kategori</code>. Bisa juga pakai
              header <code className="text-fg">## kategori</code> lalu list URL
              di bawahnya.
            </p>
            <textarea
              className="input min-h-[140px] font-mono text-xs"
              placeholder={
                "## kacamata\nhttps://instagram.com/p/abc\nhttps://instagram.com/p/def\n\nhttps://tiktok.com/x | minyak dayak"
              }
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <button
              onClick={addBulk}
              disabled={busy || !bulkText.trim()}
              className="btn-secondary mt-2"
            >
              Import bulk
            </button>
          </div>
        </div>
      )}

      {links.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          Belum ada link. Tambahkan dulu lalu generate assignment.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_100px_100px_44px] gap-3 px-4 py-2 text-xs text-muted border-b border-border bg-bg-elev/40">
            <div>URL</div>
            <div>Kategori</div>
            <div>Status</div>
            <div>Komentar</div>
            <div></div>
          </div>
          <div className="divide-y divide-border">
            {links.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[1fr_140px_100px_100px_44px] gap-3 px-4 py-2.5 items-center"
              >
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-fg hover:text-accent truncate flex items-center gap-1"
                  title={l.url}
                >
                  {l.url}
                  <ExternalLink className="size-3 shrink-0 opacity-60" />
                </a>
                <div className="text-xs">
                  <span className="badge bg-bg-elev text-muted">
                    {l.kategori}
                  </span>
                </div>
                <div>
                  <span className={cn("badge", `status-${l.status}`)}>
                    {l.status}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {counts[l.id] ?? 0} / {campaign.komentar_per_link}
                </div>
                <button
                  onClick={() => removeLink(l.id)}
                  className="text-muted hover:text-red-600 dark:text-red-400 p-1"
                  title="Hapus link"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <MetaImportModal
        open={showMeta}
        onClose={() => setShowMeta(false)}
        onComplete={() => {
          // Refresh page agar data baru muncul
          startTransition(() => router.refresh());
          notify("ok", "Import selesai");
        }}
        campaignId={campaign.id}
        perLink={campaign.komentar_per_link}
        accounts={accounts}
        skus={skus}
        hasAi={hasAi}
      />
    </div>
  );
}
