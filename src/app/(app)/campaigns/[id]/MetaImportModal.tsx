"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  X,
  Loader2,
  AlertTriangle,
  Check,
  ExternalLink,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  KeyRound,
  Wand2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { detectKategoriFromSku, type MetaSearchResult } from "@/lib/meta";
import { createClient } from "@/lib/supabase/client";
import { buildAssignments } from "@/lib/assignment";
import type { Account } from "@/lib/types";

interface Sku {
  kode: string;
  kategori: string;
}

interface CredentialLite {
  id: string;
  label: string | null;
  ad_account_id: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  campaignId: string;
  perLink: number;
  accounts: Account[];
  skus: Sku[];
  hasAi: boolean;
}

type Mode = "by-campaign" | "by-ad";

interface RowProgress {
  ad_id: string;
  status: "pending" | "saving-link" | "generating" | "saving-comments" | "assigning" | "done" | "error" | "rate-limited";
  message?: string;
  comments_count?: number;
  used_provider?: string;
}

export default function MetaImportModal({
  open,
  onClose,
  onComplete,
  campaignId,
  perLink,
  accounts,
  skus,
  hasAi,
}: Props) {
  const [creds, setCreds] = useState<CredentialLite[]>([]);
  const [credsLoading, setCredsLoading] = useState(false);
  const [selectedCredId, setSelectedCredId] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("by-campaign");
  const [keywordsText, setKeywordsText] = useState("");
  const [campaigns, setCampaigns] = useState<
    { id: string; name: string; status: string }[]
  >([]);
  const [ads, setAds] = useState<MetaSearchResult[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<
    "search" | "pick-ads" | "review" | "importing" | "done"
  >("search");

  // AI options (dipilih sebelum klik Import)
  const [useAi, setUseAi] = useState(hasAi);
  const [perLinkCount, setPerLinkCount] = useState(perLink);

  // Progress state untuk step "importing"
  const [progress, setProgress] = useState<Record<string, RowProgress>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [doneSummary, setDoneSummary] = useState<{
    linksOk: number;
    commentsTotal: number;
    failed: number;
  } | null>(null);

  // Fetch credentials saat modal terbuka
  useEffect(() => {
    if (!open) return;
    setCredsLoading(true);
    fetch("/api/meta/credentials")
      .then((r) => r.json())
      .then((d) => {
        const list: CredentialLite[] = d.data ?? [];
        setCreds(list);
        if (list.length > 0 && !selectedCredId) {
          setSelectedCredId(list[0].id);
        }
      })
      .finally(() => setCredsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset state saat modal close
  useEffect(() => {
    if (!open) {
      setKeywordsText("");
      setCampaigns([]);
      setAds([]);
      setChosen(new Set());
      setOverrides({});
      setErr(null);
      setStep("search");
      setProgress({});
      setCurrentIdx(0);
      setCancelled(false);
      setDoneSummary(null);
    }
  }, [open]);

  // Auto-detect kategori per ad — HARUS sebelum early return (Rules of Hooks)
  const detected = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of ads) {
      const fromCamp = detectKategoriFromSku(a.campaign_name, skus);
      const fromAd = detectKategoriFromSku(a.ad_name, skus);
      const hit = fromCamp ?? fromAd;
      if (hit) map[a.ad_id] = hit.kategori;
    }
    return map;
  }, [ads, skus]);

  // Parse keywords dari textarea
  const keywords = useMemo(() => {
    return keywordsText
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [keywordsText]);

  if (!open) return null;

  function getKategori(adId: string) {
    return overrides[adId] ?? detected[adId] ?? "";
  }

  function buildQs() {
    const params = new URLSearchParams();
    if (selectedCredId) params.set("cred_id", selectedCredId);
    for (const k of keywords) params.append("q", k);
    return params.toString();
  }

  async function doSearch() {
    if (keywords.length === 0) {
      setErr("Masukkan minimal 1 keyword");
      return;
    }
    if (!selectedCredId) {
      setErr("Pilih ad account dulu");
      return;
    }
    setBusy(true);
    setErr(null);
    setCampaigns([]);
    setAds([]);

    try {
      if (mode === "by-campaign") {
        const r = await fetch(`/api/meta/search-campaign?${buildQs()}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Gagal");
        setCampaigns(d.data ?? []);
        setStep("pick-ads");
      } else {
        const r = await fetch(`/api/meta/search-ad?${buildQs()}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Gagal");
        const rows: MetaSearchResult[] = d.data ?? [];
        setAds(rows);
        setChosen(new Set(rows.filter((r) => r.post_url).map((r) => r.ad_id)));
        setStep("review");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function pickCampaign(id: string) {
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (selectedCredId) params.set("cred_id", selectedCredId);
      params.set("campaign_id", id);
      const r = await fetch(`/api/meta/campaign-ads?${params.toString()}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Gagal");
      const rows: MetaSearchResult[] = d.data ?? [];
      setAds(rows);
      setChosen(new Set(rows.filter((r) => r.post_url).map((r) => r.ad_id)));
      setStep("review");
    } catch (e: any) {
      setErr(e?.message ?? "Gagal");
    } finally {
      setBusy(false);
    }
  }

  async function pickAllCampaigns() {
    if (campaigns.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (selectedCredId) params.set("cred_id", selectedCredId);
      const all: MetaSearchResult[] = [];
      const seen = new Set<string>();
      // Sequential supaya tidak hit rate limit
      for (const c of campaigns) {
        params.set("campaign_id", c.id);
        const r = await fetch(`/api/meta/campaign-ads?${params.toString()}`);
        const d = await r.json();
        if (r.ok) {
          for (const ad of d.data ?? []) {
            if (!seen.has(ad.ad_id)) {
              seen.add(ad.ad_id);
              all.push(ad);
            }
          }
        }
      }
      setAds(all);
      setChosen(new Set(all.filter((r) => r.post_url).map((r) => r.ad_id)));
      setStep("review");
    } catch (e: any) {
      setErr(e?.message ?? "Gagal");
    } finally {
      setBusy(false);
    }
  }

  function toggleChosen(id: string) {
    setChosen((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function toggleAll() {
    const eligible = ads.filter((a) => a.post_url);
    if (chosen.size === eligible.length) setChosen(new Set());
    else setChosen(new Set(eligible.map((a) => a.ad_id)));
  }

  function updateProgress(adId: string, patch: Partial<RowProgress>) {
    setProgress((p) => ({
      ...p,
      [adId]: { ...(p[adId] ?? { ad_id: adId, status: "pending" }), ...patch },
    }));
  }

  async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function doImport() {
    const rows = ads
      .filter((a) => chosen.has(a.ad_id) && a.post_url)
      .map((a) => ({
        ad: a,
        kategori: getKategori(a.ad_id),
      }))
      .filter((r) => r.kategori.trim().length > 0);

    if (rows.length === 0) {
      setErr(
        "Tidak ada baris yang siap diimport. Pastikan kategori terisi (manual atau via SKU)."
      );
      return;
    }

    if (useAi && accounts.length < perLinkCount) {
      setErr(
        `Generate AI butuh minimal ${perLinkCount} akun, sekarang ada ${accounts.length}. Tambah akun di /accounts atau matikan AI.`
      );
      return;
    }

    setErr(null);
    setStep("importing");
    setCurrentIdx(0);
    setCancelled(false);

    // Init progress
    const initProg: Record<string, RowProgress> = {};
    for (const r of rows) {
      initProg[r.ad.ad_id] = { ad_id: r.ad.ad_id, status: "pending" };
    }
    setProgress(initProg);

    const supabase = createClient();
    let linksOk = 0;
    let commentsTotal = 0;
    let failed = 0;

    // Snapshot usage map untuk balancing antar link selama proses
    const { data: usageRows } = await supabase
      .from("comment_usage")
      .select("comment_id, jumlah_pakai");
    const usageMap = new Map<string, number>();
    for (const u of usageRows ?? []) usageMap.set(u.comment_id, u.jumlah_pakai);

    // Sequential processing
    for (let i = 0; i < rows.length; i++) {
      if (cancelled) break;
      setCurrentIdx(i);
      const { ad, kategori } = rows[i];

      try {
        // 1) Insert link
        updateProgress(ad.ad_id, { status: "saving-link" });
        const { data: linkRow, error: linkErr } = await supabase
          .from("links")
          .insert({
            campaign_id: campaignId,
            url: ad.post_url!,
            kategori,
            status: "pending",
          })
          .select()
          .single();
        if (linkErr || !linkRow) {
          throw new Error(linkErr?.message ?? "Gagal insert link");
        }

        if (!useAi) {
          // Tanpa AI — link ter-insert, selesai
          updateProgress(ad.ad_id, { status: "done", comments_count: 0 });
          linksOk++;
          continue;
        }

        // 2) Generate komentar — rotation otomatis di server.
        // Kalau SEMUA provider habis (all_failed + rate_limited), wait & retry.
        updateProgress(ad.ad_id, { status: "generating" });
        let generated: { isi: string; tone: string }[] = [];
        let usedProvider: string | undefined;
        let attempt = 0;
        while (true) {
          attempt++;
          const r = await fetch("/api/ai/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: ad.post_url,
              kategori,
              count: perLinkCount,
              ad_name: ad.ad_name,
              campaign_name: ad.campaign_name,
              primary_text: ad.primary_text,
              headline: ad.headline,
              description: ad.description,
            }),
          });
          const data = await r.json();
          if (r.ok) {
            generated = data.comments ?? [];
            usedProvider = data.used_provider_label ?? data.used_provider;
            break;
          }
          // Semua provider gagal & ada yang rate-limited → wait, retry
          if (data.all_failed && data.rate_limited && attempt <= 2) {
            const waitSec = 60; // semua habis, tunggu 1 menit
            updateProgress(ad.ad_id, {
              status: "rate-limited",
              message: `Semua AI habis limit (${data.failed_providers
                ?.map((f: any) => f.provider)
                .join(", ")}), tunggu ${waitSec}s (attempt ${attempt}/2)`,
            });
            await sleep(waitSec * 1000);
            if (cancelled) break;
            continue;
          }
          // Error non-recoverable
          const detail = data.failed_providers
            ?.map((f: any) => `${f.provider}: ${f.reason}`)
            .join(" | ");
          throw new Error(detail || data.error || "AI gagal");
        }
        if (cancelled) break;

        if (generated.length === 0) {
          throw new Error("Gemini tidak mengembalikan komentar");
        }

        // 3) Insert komentar baru ke pool
        updateProgress(ad.ad_id, { status: "saving-comments" });
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Sesi habis");

        const commentRows = generated.map((c) => ({
          user_id: user.id,
          isi: c.isi,
          kategori,
          tone: c.tone,
        }));
        const { data: insertedComments, error: comErr } = await supabase
          .from("comments")
          .insert(commentRows)
          .select();
        if (comErr || !insertedComments) {
          throw new Error(comErr?.message ?? "Gagal insert komentar");
        }

        // 4) Run buildAssignments hanya untuk link ini, dengan komentar baru saja
        updateProgress(ad.ad_id, { status: "assigning" });
        const result = buildAssignments({
          links: [linkRow],
          accounts,
          comments: insertedComments,
          usage: usageMap,
          perLink: perLinkCount,
        });

        if (result.assignments.length > 0) {
          const insertRows = result.assignments.map((a) => ({
            link_id: a.link_id,
            account_id: a.account_id,
            comment_id: a.comment_id,
            urutan: a.urutan,
          }));
          const { error: aErr } = await supabase
            .from("assignments")
            .insert(insertRows);
          if (aErr) throw new Error(`Insert assignment: ${aErr.message}`);

          const upserts = Array.from(result.updatedUsage.entries()).map(
            ([comment_id, jumlah_pakai]) => ({ comment_id, jumlah_pakai })
          );
          if (upserts.length > 0) {
            await supabase
              .from("comment_usage")
              .upsert(upserts, { onConflict: "comment_id" });
            for (const [k, v] of result.updatedUsage) usageMap.set(k, v);
          }
        }

        updateProgress(ad.ad_id, {
          status: "done",
          comments_count: generated.length,
          used_provider: usedProvider,
        });
        linksOk++;
        commentsTotal += generated.length;

        // 5) Throttle ringan 1.5s antar request — dengan 3 provider rotasi
        // (effective ~75 RPM kombinasi), tidak perlu wait lama
        if (i < rows.length - 1) {
          await sleep(1500);
        }
      } catch (e: any) {
        updateProgress(ad.ad_id, {
          status: "error",
          message: e?.message ?? "Error",
        });
        failed++;
      }
    }

    setDoneSummary({ linksOk, commentsTotal, failed });
    setStep("done");
  }

  function finishAndClose() {
    onComplete();
    onClose();
  }

  const eligibleCount = ads.filter((a) => a.post_url).length;
  const skippedCount = ads.length - eligibleCount;
  const readyCount = ads.filter(
    (a) => chosen.has(a.ad_id) && a.post_url && getKategori(a.ad_id).trim()
  ).length;
  const missingKategori = ads.filter(
    (a) => chosen.has(a.ad_id) && a.post_url && !getKategori(a.ad_id).trim()
  ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-accent" />
            <h2 className="font-semibold">Import dari Meta Ads</h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X className="size-4" />
          </button>
        </div>

        {/* Ad account picker (selalu tampil di atas) */}
        <div className="px-5 py-3 border-b border-border bg-bg-elev/40">
          {credsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              Memuat ad accounts...
            </div>
          ) : creds.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5" />
              Belum ada ad account. Tambah dulu di Settings.
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <KeyRound className="size-3.5 text-muted shrink-0" />
              <label className="text-xs text-muted shrink-0">
                Import dari:
              </label>
              <select
                value={selectedCredId ?? ""}
                onChange={(e) => {
                  setSelectedCredId(e.target.value);
                  setCampaigns([]);
                  setAds([]);
                  setStep("search");
                }}
                className="input !py-1 text-sm flex-1"
              >
                {creds.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label ?? `Ad Account ${c.ad_account_id}`} (act_
                    {c.ad_account_id})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Step indicator */}
        <div className="px-5 py-2 border-b border-border bg-bg-elev/40 text-xs flex items-center gap-2">
          <StepDot
            active={step === "search"}
            done={step !== "search"}
            label="Cari"
          />
          <ChevronRight className="size-3 text-muted" />
          <StepDot
            active={step === "pick-ads" || (mode === "by-ad" && step === "review")}
            done={step === "review"}
            label={mode === "by-campaign" ? "Pilih campaign" : "Hasil"}
          />
          {mode === "by-campaign" && (
            <>
              <ChevronRight className="size-3 text-muted" />
              <StepDot
                active={step === "review"}
                done={false}
                label="Review & import"
              />
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Step: Search */}
          {step === "search" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("by-campaign")}
                  className={cn(
                    "flex-1 card p-3 text-sm text-left transition-colors",
                    mode === "by-campaign"
                      ? "border-accent bg-accent/5"
                      : "hover:border-border-strong"
                  )}
                >
                  <div className="font-semibold">By campaign name</div>
                  <div className="text-xs text-muted mt-0.5">
                    Cari campaign dulu, lalu pilih → list ads di dalamnya
                  </div>
                </button>
                <button
                  onClick={() => setMode("by-ad")}
                  className={cn(
                    "flex-1 card p-3 text-sm text-left transition-colors",
                    mode === "by-ad"
                      ? "border-accent bg-accent/5"
                      : "hover:border-border-strong"
                  )}
                >
                  <div className="font-semibold">By ad / creative name</div>
                  <div className="text-xs text-muted mt-0.5">
                    Cari ads langsung berdasar nama creative
                  </div>
                </button>
              </div>

              <div>
                <label className="text-xs text-muted block mb-1 flex items-center justify-between">
                  <span>
                    Keyword{" "}
                    <span className="text-muted/70">
                      (satu per baris untuk bulk)
                    </span>
                  </span>
                  {keywords.length > 0 && (
                    <span className="text-accent font-medium">
                      {keywords.length} keyword
                    </span>
                  )}
                </label>
                <textarea
                  autoFocus
                  className="input min-h-[100px] font-mono text-xs"
                  placeholder={
                    mode === "by-campaign"
                      ? "KCM\nMDK\nPURCHASE\n\natau pisahkan koma: KCM, MDK, PURCHASE"
                      : "DVN-HYC1-OKT - 06/05\nKCM-FCI - 22/04\nMDK-LC - 25/04"
                  }
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  onKeyDown={(e) => {
                    // Cmd/Ctrl + Enter = submit
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      doSearch();
                    }
                  }}
                />
                <div className="text-[11px] text-muted mt-1">
                  Pisahkan tiap keyword dengan baris baru atau koma. Tekan{" "}
                  <kbd className="kbd">⌘</kbd>+<kbd className="kbd">Enter</kbd>{" "}
                  untuk submit.
                </div>
              </div>

              <button
                onClick={doSearch}
                disabled={busy || keywords.length === 0 || creds.length === 0}
                className="btn-primary w-full justify-center"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Search className="size-4" /> Cari{" "}
                    {keywords.length > 1
                      ? `${keywords.length} keyword`
                      : ""}
                  </>
                )}
              </button>

              {err && <ErrBox text={err} />}
            </div>
          )}

          {/* Step: pick campaign */}
          {step === "pick-ads" && mode === "by-campaign" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep("search")}
                  className="text-xs text-muted hover:text-fg flex items-center gap-1"
                >
                  <ChevronLeft className="size-3" /> ubah pencarian
                </button>
                {campaigns.length > 1 && (
                  <button
                    onClick={pickAllCampaigns}
                    disabled={busy}
                    className="btn-ghost text-xs text-accent"
                  >
                    Ambil semua ads dari {campaigns.length} campaign
                  </button>
                )}
              </div>

              {busy ? (
                <div className="text-center py-12">
                  <Loader2 className="size-6 animate-spin mx-auto text-muted" />
                </div>
              ) : campaigns.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">
                  Tidak ada campaign yang cocok dengan keyword(s).
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted">
                    {campaigns.length} campaign cocok — klik untuk lihat ads-nya
                  </p>
                  {campaigns.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => pickCampaign(c.id)}
                      disabled={busy}
                      className="w-full card p-3 text-left hover:border-accent hover:bg-bg-elev transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {c.name}
                        </div>
                        <div className="text-[10px] text-muted mt-0.5 font-mono">
                          {c.status}
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {err && <ErrBox text={err} />}
            </div>
          )}

          {/* Step: review ads */}
          {step === "review" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() =>
                    setStep(mode === "by-campaign" ? "pick-ads" : "search")
                  }
                  className="text-xs text-muted hover:text-fg flex items-center gap-1"
                >
                  <ChevronLeft className="size-3" /> kembali
                </button>
                {ads.length > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">
                      {ads.length} ads ditemukan
                    </span>
                    <button
                      onClick={toggleAll}
                      className="text-xs text-accent hover:underline"
                    >
                      {chosen.size === eligibleCount
                        ? "Uncheck all"
                        : "Select all"}
                    </button>
                  </div>
                )}
              </div>

              {ads.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">
                  Tidak ada ads di campaign ini
                </p>
              ) : (
                <>
                  {skippedCount > 0 && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
                      {skippedCount} ad tanpa post URL (kemungkinan dark
                      post/unpublished) di-skip
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {ads.map((a) => {
                      const isEligible = !!a.post_url;
                      const isChosen = chosen.has(a.ad_id);
                      const kat = getKategori(a.ad_id);
                      const detKat = detected[a.ad_id];
                      return (
                        <div
                          key={a.ad_id}
                          className={cn(
                            "card p-3 flex items-start gap-3",
                            !isEligible && "opacity-50"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChosen}
                            disabled={!isEligible}
                            onChange={() => toggleChosen(a.ad_id)}
                            className="accent-accent mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-medium text-sm truncate">
                                {a.ad_name}
                              </div>
                              <span
                                className={cn(
                                  "badge text-[10px]",
                                  a.ad_status === "ACTIVE"
                                    ? "status-selesai"
                                    : "status-pending"
                                )}
                              >
                                {a.ad_status}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted truncate">
                              dari: {a.campaign_name}
                            </div>
                            {a.post_url ? (
                              <a
                                href={a.post_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-accent hover:underline font-mono break-all inline-flex items-center gap-1 mt-1"
                              >
                                {a.post_url}
                                <ExternalLink className="size-3 shrink-0" />
                              </a>
                            ) : (
                              <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                                Tidak ada post URL (skipped)
                              </div>
                            )}
                            {/* Preview primary text supaya user tahu konteks AI */}
                            {a.primary_text && (
                              <details className="mt-1.5">
                                <summary className="text-[10px] text-muted cursor-pointer hover:text-fg select-none">
                                  📝 Caption iklan ({a.primary_text.length} char) — klik untuk lihat
                                </summary>
                                <div className="mt-1.5 p-2 bg-bg-elev rounded text-[11px] leading-relaxed whitespace-pre-wrap text-muted max-h-40 overflow-y-auto">
                                  {a.primary_text}
                                </div>
                              </details>
                            )}
                            {isEligible && (
                              <div className="flex items-center gap-2 mt-2">
                                <input
                                  className="input !py-1 text-xs flex-1 max-w-[260px]"
                                  placeholder={
                                    detKat
                                      ? `auto-detected: ${detKat}`
                                      : "kategori (manual)"
                                  }
                                  value={overrides[a.ad_id] ?? ""}
                                  onChange={(e) =>
                                    setOverrides((p) => ({
                                      ...p,
                                      [a.ad_id]: e.target.value,
                                    }))
                                  }
                                />
                                {kat && (
                                  <span className="badge bg-bg-elev text-muted text-[10px]">
                                    → {kat}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {err && <ErrBox text={err} />}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "review" && ads.length > 0 && (
          <div className="px-5 py-3 border-t border-border bg-bg-elev/40 space-y-3">
            {/* AI options */}
            {hasAi ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAi}
                    onChange={(e) => setUseAi(e.target.checked)}
                    className="accent-accent"
                  />
                  <Wand2 className="size-4 text-accent" />
                  <span>Generate komentar pakai AI (rotasi multi-provider)</span>
                </label>
                {useAi && (
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted">per link:</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={perLinkCount}
                      onChange={(e) =>
                        setPerLinkCount(parseInt(e.target.value) || 1)
                      }
                      className="input !py-1 !px-2 w-16 text-sm"
                    />
                    <span className="text-xs text-muted">komentar</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 text-amber-500" />
                AI belum di-set up. Tambah minimal 1 dari Gemini / Cerebras / Groq di{" "}
                <a
                  href="/settings"
                  target="_blank"
                  className="text-accent hover:underline"
                >
                  Settings
                </a>{" "}
                untuk auto-generate komentar.
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-muted">
                <strong className="text-fg">{readyCount}</strong> siap import ·{" "}
                {missingKategori > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    {missingKategori} butuh kategori
                  </span>
                )}
                {useAi && readyCount > 0 && (
                  <span className="ml-2 text-accent">
                    · estimasi {Math.ceil((readyCount * 1.5) / 60)} menit (AI)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-ghost text-sm">
                  Batal
                </button>
                <button
                  onClick={doImport}
                  disabled={readyCount === 0}
                  className="btn-primary"
                >
                  {useAi ? (
                    <>
                      <Wand2 className="size-4" /> Import + Generate {readyCount}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" /> Import {readyCount} link
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Importing state */}
        {step === "importing" && (
          <ImportingProgress
            ads={ads.filter((a) => chosen.has(a.ad_id) && a.post_url)}
            progress={progress}
            currentIdx={currentIdx}
            cancelled={cancelled}
            onCancel={() => setCancelled(true)}
          />
        )}

        {/* Done state */}
        {step === "done" && doneSummary && (
          <DoneSummary
            summary={doneSummary}
            progress={progress}
            ads={ads.filter((a) => chosen.has(a.ad_id) && a.post_url)}
            onClose={finishAndClose}
          />
        )}
      </div>
    </div>
  );
}

function StepDot({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        active
          ? "text-fg font-semibold"
          : done
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          active ? "bg-accent" : done ? "bg-emerald-500" : "bg-muted/50"
        )}
      />
      {label}
    </span>
  );
}

function ErrBox({ text }: { text: string }) {
  return (
    <div className="text-xs rounded-md px-3 py-2 border bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20 flex items-start gap-2">
      <AlertTriangle className="size-4 shrink-0 mt-0.5" />
      <span className="break-words">{text}</span>
    </div>
  );
}

// =================== IMPORTING PROGRESS ===================

function ImportingProgress({
  ads,
  progress,
  currentIdx,
  cancelled,
  onCancel,
}: {
  ads: MetaSearchResult[];
  progress: Record<string, RowProgress>;
  currentIdx: number;
  cancelled: boolean;
  onCancel: () => void;
}) {
  const total = ads.length;
  const done = Object.values(progress).filter(
    (p) => p.status === "done"
  ).length;
  const errors = Object.values(progress).filter(
    (p) => p.status === "error"
  ).length;
  const pct = total === 0 ? 0 : Math.round(((done + errors) / total) * 100);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-sm font-medium">
              Memproses {Math.min(currentIdx + 1, total)} dari {total}
            </div>
            <div className="text-xs text-muted">{pct}%</div>
          </div>
          <div className="h-2 bg-bg-elev rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="space-y-1.5 mt-4">
          {ads.map((ad) => {
            const p = progress[ad.ad_id];
            const status = p?.status ?? "pending";
            return (
              <div
                key={ad.ad_id}
                className={cn(
                  "card p-3 flex items-center gap-3 transition-colors",
                  status === "done" && "border-emerald-500/30 bg-emerald-500/5",
                  status === "error" && "border-red-500/30 bg-red-500/5",
                  status === "rate-limited" &&
                    "border-amber-500/30 bg-amber-500/5"
                )}
              >
                <StatusIcon status={status} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {ad.ad_name}
                  </div>
                  <div className="text-[11px] text-muted truncate">
                    {statusLabel(status)}
                    {p?.message && ` · ${p.message}`}
                    {status === "done" &&
                      p?.comments_count !== undefined &&
                      p.comments_count > 0 &&
                      ` · ${p.comments_count} komentar`}
                    {status === "done" && p?.used_provider && (
                      <span className="text-accent"> · via {p.used_provider}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-border bg-bg-elev/40 flex items-center justify-between">
        <div className="text-xs text-muted">
          <span className="text-emerald-600 dark:text-emerald-400">
            {done} selesai
          </span>
          {errors > 0 && (
            <>
              {" · "}
              <span className="text-red-600 dark:text-red-400">
                {errors} error
              </span>
            </>
          )}
        </div>
        {!cancelled && done + errors < total && (
          <button onClick={onCancel} className="btn-ghost text-xs text-red-500">
            Hentikan
          </button>
        )}
        {cancelled && (
          <span className="text-xs text-muted italic">menghentikan...</span>
        )}
      </div>
    </>
  );
}

function StatusIcon({ status }: { status: RowProgress["status"] }) {
  const baseClass = "size-7 rounded-full flex items-center justify-center shrink-0";
  switch (status) {
    case "done":
      return (
        <div className={cn(baseClass, "bg-emerald-500/15")}>
          <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
        </div>
      );
    case "error":
      return (
        <div className={cn(baseClass, "bg-red-500/15")}>
          <X className="size-4 text-red-600 dark:text-red-400" />
        </div>
      );
    case "rate-limited":
      return (
        <div className={cn(baseClass, "bg-amber-500/15")}>
          <Clock className="size-3.5 text-amber-600 dark:text-amber-400" />
        </div>
      );
    case "pending":
      return (
        <div className={cn(baseClass, "bg-bg-elev")}>
          <span className="size-1.5 rounded-full bg-muted" />
        </div>
      );
    default:
      return (
        <div className={cn(baseClass, "bg-accent/15")}>
          <Loader2 className="size-3.5 text-accent animate-spin" />
        </div>
      );
  }
}

function statusLabel(status: RowProgress["status"]): string {
  switch (status) {
    case "pending":
      return "Menunggu...";
    case "saving-link":
      return "Menyimpan link...";
    case "generating":
      return "Generate komentar dengan AI...";
    case "saving-comments":
      return "Menyimpan komentar...";
    case "assigning":
      return "Membuat assignment...";
    case "rate-limited":
      return "Rate limit, menunggu...";
    case "done":
      return "Selesai";
    case "error":
      return "Error";
  }
}

// =================== DONE SUMMARY ===================

function DoneSummary({
  summary,
  progress,
  ads,
  onClose,
}: {
  summary: { linksOk: number; commentsTotal: number; failed: number };
  progress: Record<string, RowProgress>;
  ads: MetaSearchResult[];
  onClose: () => void;
}) {
  const failed = ads.filter((a) => progress[a.ad_id]?.status === "error");

  return (
    <>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="flex flex-col items-center justify-center text-center mb-6">
          <div
            className={cn(
              "size-16 rounded-full flex items-center justify-center mb-4",
              summary.failed > 0
                ? "bg-amber-500/15"
                : "bg-emerald-500/15"
            )}
          >
            {summary.failed > 0 ? (
              <AlertTriangle className="size-10 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <h3 className="text-xl font-semibold mb-2">Selesai!</h3>
          <div className="text-sm text-muted space-y-1">
            <div>
              <strong className="text-fg">{summary.linksOk}</strong> link
              ditambahkan
            </div>
            {summary.commentsTotal > 0 && (
              <div>
                <strong className="text-fg">{summary.commentsTotal}</strong>{" "}
                komentar di-generate & assigned
              </div>
            )}
            {summary.failed > 0 && (
              <div className="text-red-600 dark:text-red-400">
                {summary.failed} gagal
              </div>
            )}
          </div>
        </div>

        {/* Detail error per row */}
        {failed.length > 0 && (
          <div className="space-y-2 mt-6">
            <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
              Detail error:
            </div>
            {failed.map((a) => {
              const p = progress[a.ad_id];
              return (
                <div
                  key={a.ad_id}
                  className="card p-3 border-red-500/20 bg-red-500/5 text-xs"
                >
                  <div className="font-medium text-fg truncate mb-1">
                    {a.ad_name}
                  </div>
                  <div className="text-red-700 dark:text-red-300 break-words">
                    {p?.message ?? "Unknown error"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="px-5 py-3 border-t border-border bg-bg-elev/40 flex justify-end">
        <button onClick={onClose} className="btn-primary">
          Tutup
        </button>
      </div>
    </>
  );
}
