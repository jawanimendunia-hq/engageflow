"use client";

import { useEffect, useState, useTransition } from "react";
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
  FileSpreadsheet,
  Save,
  StickyNote,
  RotateCcw,
  CheckCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Account, Campaign, LinkRow } from "@/lib/types";
import { parseBulkLinks, cn, fmtDateTime } from "@/lib/utils";
import { buildAssignments } from "@/lib/assignment";
import MetaImportModal from "./MetaImportModal";
import { useDialog } from "@/components/DialogProvider";
import { createRetryJob, loadRetryJobs, saveRetryJob, removeRetryJobsForLink, retryStorageKey, type ImportRetryJob } from "@/lib/import-retry";

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
  const dialog = useDialog();
  const [links, setLinks] = useState<LinkRow[]>(initialLinks);
  const [counts, setCounts] = useState(assignmentCounts);
  const [showAdd, setShowAdd] = useState(initialLinks.length === 0);
  const [showMeta, setShowMeta] = useState(false);
  const [retryJobs, setRetryJobs] = useState<ImportRetryJob[]>([]);
  const [retrySelection, setRetrySelection] = useState<ImportRetryJob[] | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [singleUrl, setSingleUrl] = useState("");
  const [singleKat, setSingleKat] = useState("");
  const [note, setNote] = useState(campaign.catatan ?? "");
  const [savedNote, setSavedNote] = useState(campaign.catatan ?? "");
  const [lastUpdated, setLastUpdated] = useState(
    campaign.updated_at ?? campaign.created_at
  );
  const [noteSaving, setNoteSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );
  const [, startTransition] = useTransition();

  function notify(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  useEffect(() => {
    setLinks(initialLinks);
    setCounts(assignmentCounts);
  }, [initialLinks, assignmentCounts]);

  useEffect(() => {
    const refreshJobs = () => setRetryJobs(loadRetryJobs(campaign.user_id, campaign.id));
    const onStorage = (event: StorageEvent) => {
      if (event.key === retryStorageKey(campaign.user_id, campaign.id)) refreshJobs();
    };
    refreshJobs();
    window.addEventListener("engageflow-import-retry", refreshJobs);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("engageflow-import-retry", refreshJobs);
      window.removeEventListener("storage", onStorage);
    };
  }, [campaign.user_id, campaign.id]);

  function retryImport(jobs: ImportRetryJob[]) {
    if (!hasAi && jobs.some((job) => job.useAi)) {
      notify("err", "Aktifkan AI provider di Settings terlebih dahulu.");
      return;
    }
    try {
      jobs.forEach((job) => saveRetryJob(campaign.user_id, campaign.id, job));
      setRetrySelection(jobs);
      setShowMeta(true);
    } catch (error) {
      notify("err", (error as Error).message);
    }
  }

  function retryLink(link: LinkRow) {
    const saved = retryJobs.find((job) => job.linkId === link.id || job.ad.post_url === link.url);
    const job = saved ?? createRetryJob({
      ad_id: `link:${link.id}`, ad_name: link.kategori, ad_status: "",
      campaign_id: campaign.id, campaign_name: "", post_url: link.url,
      page_id: null, post_id: null, primary_text: null, headline: null,
      description: null, matched_keywords: link.source_keywords,
    }, link.kategori, campaign.komentar_per_link, true);
    retryImport([{
      ...job, linkId: link.id, status: "pending", useAi: true,
      count: job.useAi ? job.count : campaign.komentar_per_link,
    }]);
  }

  const unfinishedJobs = retryJobs.filter((job) => job.status !== "done" && (
    !job.linkId || !links.some((link) => link.id === job.linkId && (
      link.status === "selesai" || (counts[link.id] ?? 0) >= job.count
    ))
  ));
  const jobsByLink = new Map(retryJobs.filter((job) => job.linkId).map((job) => [job.linkId!, job]));

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
    if (
      !(await dialog.confirm(
        "Link dan seluruh assignment di dalamnya akan ikut dihapus.",
        {
          title: "Hapus link?",
          confirmText: "Ya, hapus",
          variant: "danger",
        }
      ))
    ) return;
    const supabase = createClient();
    const { error } = await supabase.from("links").delete().eq("id", id);
    if (error) {
      notify("err", error.message);
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== id));
    removeRetryJobsForLink(campaign.user_id, campaign.id, id);
    notify("ok", "Link dihapus");
  }

  async function saveNote() {
    setNoteSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("campaigns")
      .update({ catatan: note.trim() || null })
      .eq("id", campaign.id)
      .select("updated_at")
      .single();
    setNoteSaving(false);

    if (error) {
      notify("err", error.message);
      return;
    }

    const normalizedNote = note.trim();
    setNote(normalizedNote);
    setSavedNote(normalizedNote);
    setLastUpdated(data.updated_at);
    notify("ok", "Catatan campaign disimpan");
    startTransition(() => router.refresh());
  }

  async function setLinkCompleted(link: LinkRow, completed: boolean) {
    const completesWholeCampaign =
      completed &&
      links.every((item) => item.id === link.id || item.status === "selesai");

    if (
      completesWholeCampaign &&
      !(await dialog.confirm(
        "Ini adalah link terakhir. Setelah campaign selesai, assignment komentar AI akan dihapus permanen untuk menghemat database.",
        {
          title: "Selesaikan campaign?",
          confirmText: "Selesaikan",
          variant: "danger",
        }
      ))
    ) {
      return;
    }

    if (
      !completed &&
      !(await dialog.confirm(
        "Assignment dari bank komentar akan kembali ke pending, tetapi komentar AI yang sudah dibersihkan tidak dapat dipulihkan.",
        {
          title: "Buka kembali link?",
          confirmText: "Buka kembali",
        }
      ))
    ) {
      return;
    }

    setStatusBusy(link.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_link_manual_completion", {
      p_link_id: link.id,
      p_completed: completed,
    });
    setStatusBusy(null);

    if (error) {
      notify("err", error.message);
      return;
    }

    setLinks((prev) =>
      prev.map((item) =>
        item.id === link.id
          ? { ...item, status: completed ? "selesai" : "pending" }
          : item
      )
    );
    notify(
      "ok",
      completed ? "Link ditandai selesai" : "Link dikembalikan ke pending"
    );
    startTransition(() => router.refresh());
  }

  async function completeCampaign() {
    if (links.length === 0) {
      notify("err", "Belum ada link di campaign ini.");
      return;
    }
    if (
      !(await dialog.confirm(
        "Semua link akan dianggap sudah dikerjakan dan assignment komentar AI akan dihapus permanen untuk menghemat database.",
        {
          title: "Selesaikan seluruh campaign?",
          confirmText: "Ya, selesaikan",
          variant: "danger",
        }
      ))
    ) {
      return;
    }

    setStatusBusy("campaign");
    const supabase = createClient();
    const { error } = await supabase.rpc("set_campaign_manual_completion", {
      p_campaign_id: campaign.id,
    });
    setStatusBusy(null);

    if (error) {
      notify("err", error.message);
      return;
    }

    setLinks((prev) =>
      prev.map((link) => ({ ...link, status: "selesai" as const }))
    );
    notify("ok", "Seluruh campaign ditandai selesai");
    startTransition(() => router.refresh());
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
  const allLinksCompleted =
    links.length > 0 && links.every((link) => link.status === "selesai");

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

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <StickyNote className="size-4" /> Catatan campaign
            </h3>
            <p className="text-xs text-muted mt-1">
              Terakhir diubah {fmtDateTime(lastUpdated)}
            </p>
          </div>
          <button
            type="button"
            onClick={saveNote}
            disabled={noteSaving || note === savedNote}
            className="btn-secondary"
          >
            <Save className="size-4" />
            {noteSaving ? "Menyimpan..." : "Simpan catatan"}
          </button>
        </div>
        <textarea
          className="input min-h-[100px]"
          placeholder="Tulis perubahan terakhir, target berikutnya, atau hal yang perlu diingat..."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-muted">
            {totalAsg} assignment ·{" "}
            <span className={linksWithoutAsg > 0 ? "text-yellow-600 dark:text-yellow-400" : ""}>
              {linksWithoutAsg} link belum di-assign
            </span>
          </div>
          <div className="text-xs text-muted mt-1">
            Assignment AI otomatis dibersihkan setelah seluruh campaign selesai.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={completeCampaign}
            disabled={
              statusBusy !== null || links.length === 0 || allLinksCompleted
            }
            className="btn-secondary"
            title="Dipakai jika seluruh komentar dikerjakan manual di luar Mode Eksekusi"
          >
            <CheckCheck className="size-4" />
            {allLinksCompleted
              ? "Campaign selesai"
              : statusBusy === "campaign"
                ? "Menyimpan..."
                : "Tandai campaign selesai"}
          </button>
          {metaConnected ? (
            <button
              onClick={() => { setRetrySelection(null); setShowMeta(true); }}
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
          <a
            href={`/api/campaigns/${campaign.id}/export`}
            className={cn(
              "btn-secondary",
              (links.length === 0 || totalAsg === 0) &&
                "pointer-events-none opacity-50"
            )}
            title={
              links.length === 0
                ? "Belum ada link"
                : totalAsg === 0
                  ? "Belum ada assignment yang bisa diexport"
                  : "Export semua link + komentar ke Excel"
            }
          >
            <FileSpreadsheet className="size-4" /> Export Excel
          </a>
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

      {unfinishedJobs.length > 0 && (
        <section className="card p-4 mb-4 border-amber-500/30" aria-label="Iklan yang perlu retry">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" /> {unfinishedJobs.length} iklan belum selesai</h3>
              <p className="text-xs text-muted mt-1">Konteks retry tersimpan di browser ini, termasuk komentar yang sudah lolos. Retry melanjutkan link yang sama.</p>
            </div>
            <button type="button" onClick={() => retryImport(unfinishedJobs)} disabled={showMeta || busy} className="btn-ghost text-xs">
              <RotateCcw className="size-3.5" /> Retry semua
            </button>
          </div>
          <div className="space-y-2">
            {unfinishedJobs.map((job) => (
              <div key={job.ad.ad_id} className="rounded-xl border border-border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" title={job.ad.ad_name}>{job.ad.ad_name}</div>
                  <p className="text-xs text-red-700 mt-1 break-words">{job.error || "Proses belum selesai atau terhenti. Klik Retry untuk melanjutkan."}</p>
                  {job.partialComments.length > 0 && <p className="text-xs text-muted mt-1">{job.partialComments.length} komentar lolos disimpan.</p>}
                </div>
                <button type="button" onClick={() => retryImport([job])} disabled={showMeta || busy} className="btn-ghost shrink-0 text-xs" aria-label={`Retry ${job.ad.ad_name}`}>
                  <RotateCcw className="size-3.5" /> Retry
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {links.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          Belum ada link. Tambahkan dulu lalu generate assignment.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="grid min-w-[1100px] grid-cols-[minmax(260px,1fr)_180px_140px_100px_100px_150px_44px] gap-3 px-4 py-2 text-xs text-muted border-b border-border bg-bg-elev/40">
            <div>URL</div>
            <div>Keyword</div>
            <div>Kategori</div>
            <div>Status</div>
            <div>Komentar</div>
            <div>Selesai manual</div>
            <div></div>
          </div>
          <div className="divide-y divide-border">
            {links.map((l) => (
              <div
                key={l.id}
                className="grid min-w-[1100px] grid-cols-[minmax(260px,1fr)_180px_140px_100px_100px_150px_44px] gap-3 px-4 py-2.5 items-center"
              >
                <div className="min-w-0">
                  {jobsByLink.get(l.id)?.ad.ad_name && (
                    <div className="text-sm font-medium truncate">{jobsByLink.get(l.id)?.ad.ad_name}</div>
                  )}
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
                </div>
                <div className="flex flex-wrap gap-1">
                  {(l.source_keywords ?? []).length > 0 ? (
                    l.source_keywords.map((keyword) => (
                      <span
                        key={keyword.toLocaleLowerCase()}
                        className="badge bg-accent/10 text-accent text-[10px]"
                        title="Keyword pencarian Meta"
                      >
                        {keyword}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </div>
                <div className="text-xs">
                  <span className="badge bg-bg-elev text-muted">
                    {l.kategori}
                  </span>
                </div>
                <div>
                  <span className={cn("badge", `status-${l.status}`)}>
                    {l.status}
                  </span>
                  {jobsByLink.get(l.id)?.status === "failed" && l.status !== "selesai" && (
                    <div className="text-[10px] text-red-700 mt-1">Import gagal</div>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {l.status === "selesai"
                    ? "selesai"
                    : `${counts[l.id] ?? 0} / ${jobsByLink.get(l.id)?.count ?? campaign.komentar_per_link}`}
                  {hasAi && l.status !== "selesai" && (counts[l.id] ?? 0) < (jobsByLink.get(l.id)?.count ?? campaign.komentar_per_link) && (
                    <button type="button" onClick={() => retryLink(l)} disabled={showMeta || busy} className="btn-ghost !px-1 !py-1 text-xs mt-1" title="Lengkapi komentar AI tanpa menambah link baru">
                      <RotateCcw className="size-3" /> {(counts[l.id] ?? 0) === 0 ? "Retry AI" : "Lengkapi AI"}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLinkCompleted(l, l.status !== "selesai")}
                  disabled={statusBusy !== null}
                  className={cn(
                    "btn-ghost justify-start px-2 text-xs",
                    l.status !== "selesai" &&
                      "text-emerald-600 dark:text-emerald-400"
                  )}
                  title={
                    l.status === "selesai"
                      ? "Kembalikan link dan assignment ke pending"
                      : "Anggap komentar untuk link ini sudah dikerjakan manual"
                  }
                >
                  {l.status === "selesai" ? (
                    <RotateCcw className="size-3.5" />
                  ) : (
                    <CheckCircle2 className="size-3.5" />
                  )}
                  {statusBusy === l.id
                    ? "Menyimpan..."
                    : l.status === "selesai"
                      ? "Buka lagi"
                      : "Tandai selesai"}
                </button>
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
        onClose={() => { setShowMeta(false); setRetrySelection(null); }}
        onComplete={() => {
          // Refresh page agar data baru muncul
          startTransition(() => router.refresh());
        }}
        campaignId={campaign.id}
        perLink={campaign.komentar_per_link}
        accounts={accounts}
        skus={skus}
        hasAi={hasAi}
        userId={campaign.user_id}
        retryJobs={retrySelection}
      />
    </div>
  );
}
