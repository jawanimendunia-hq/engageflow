"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  User,
  Sparkles,
  PartyPopper,
  Play,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { suggestDelay } from "@/lib/assignment";
import { colorOf } from "@/lib/colors";

export interface EnrichedAssignment {
  id: string;
  link_id: string;
  account_id: string;
  /** Null jika komentar disimpan inline (hasil AI Meta Import) */
  comment_id: string | null;
  status: "pending" | "selesai";
  urutan: number;
  link_url: string;
  link_kategori: string;
  link_status: "pending" | "proses" | "selesai";
  account_nama: string;
  account_warna: string | null;
  comment_isi: string;
  comment_tone: string;
}

interface Props {
  campaignId: string;
  campaignName: string;
  assignments: EnrichedAssignment[];
  accounts: { id: string; nama: string; warna?: string | null }[];
}

export default function ExecuteClient({
  campaignId,
  campaignName,
  assignments: initial,
  accounts,
}: Props) {
  const [assignments, setAssignments] = useState(initial);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [delayHint] = useState(() => suggestDelay());

  // Group by account: hanya pending
  const groups = useMemo(() => {
    const map = new Map<string, EnrichedAssignment[]>();
    for (const a of assignments) {
      if (a.status !== "pending") continue;
      const list = map.get(a.account_id) ?? [];
      list.push(a);
      map.set(a.account_id, list);
    }
    // sort tiap antrian: per link berurutan, lalu urutan
    for (const [k, list] of map) {
      list.sort((x, y) => {
        if (x.link_id !== y.link_id) return x.link_id.localeCompare(y.link_id);
        return x.urutan - y.urutan;
      });
    }
    return map;
  }, [assignments]);

  const currentQueue = selectedAccount ? groups.get(selectedAccount) ?? [] : [];
  const current = currentQueue[idx];

  // Stat per akun untuk picker
  const accountStats = useMemo(() => {
    return accounts
      .map((a) => {
        const allForAccount = assignments.filter((x) => x.account_id === a.id);
        const pending = allForAccount.filter((x) => x.status === "pending").length;
        const total = allForAccount.length;
        return { ...a, pending, total };
      })
      .sort((a, b) => b.pending - a.pending);
  }, [accounts, assignments]);

  // Helper: copy + open dalam satu user-gesture (dipanggil dari onClick)
  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  function openInNewTab(url: string) {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function bukaDanCopy() {
    if (!current) return;
    const ok = await copyToClipboard(current.comment_isi);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    openInNewTab(current.link_url);
  }

  async function justCopy() {
    if (!current) return;
    const ok = await copyToClipboard(current.comment_isi);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function justOpen() {
    if (!current) return;
    openInNewTab(current.link_url);
  }

  async function selesaiDanLanjut() {
    if (!current) return;
    const supabase = createClient();
    const finishedId = current.id;
    const finishedLinkId = current.link_id;

    // 1) Optimistic: tandai assignment ini selesai di state
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === finishedId ? { ...a, status: "selesai" as const } : a
      )
    );

    // 2) Geser idx kalau ujung list — kalau bukan, biarkan (item shift down naturally)
    const newQueueLen = currentQueue.length - 1;
    if (newQueueLen <= 0) {
      // tidak ada lagi → idx tidak penting, UI akan tampilkan layar selesai
    } else if (idx >= newQueueLen) {
      setIdx(newQueueLen - 1);
    }
    // else idx tetap, item berikutnya otomatis menggantikan posisi current

    // 3) Persist assignment selesai
    await supabase
      .from("assignments")
      .update({ status: "selesai" })
      .eq("id", finishedId);

    // 4) Cek apakah semua assignment untuk link ini sudah selesai → set status link
    const remaining = assignments.filter(
      (a) =>
        a.link_id === finishedLinkId &&
        a.id !== finishedId &&
        a.status === "pending"
    );
    await supabase
      .from("links")
      .update({ status: remaining.length === 0 ? "selesai" : "proses" })
      .eq("id", finishedLinkId);

    // 5) Auto-buka link berikutnya & copy komentarnya (dipicu dari klik user → tidak diblokir)
    const updatedAfter = assignments.map((a) =>
      a.id === finishedId ? { ...a, status: "selesai" as const } : a
    );
    const nextQueue = updatedAfter
      .filter((a) => a.account_id === selectedAccount && a.status === "pending")
      .sort((x, y) => {
        if (x.link_id !== y.link_id) return x.link_id.localeCompare(y.link_id);
        return x.urutan - y.urutan;
      });
    const targetIdx = Math.min(idx, nextQueue.length - 1);
    const nextAssignment = nextQueue[targetIdx];
    if (nextAssignment) {
      await copyToClipboard(nextAssignment.comment_isi);
      openInNewTab(nextAssignment.link_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function next() {
    setIdx((i) => Math.min(i + 1, Math.max(currentQueue.length - 1, 0)));
  }
  function prev() {
    setIdx((i) => Math.max(i - 1, 0));
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      if (!selectedAccount || !current) return;

      if (e.key === "Enter") {
        e.preventDefault();
        bukaDanCopy();
      } else if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        selesaiDanLanjut();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key.toLowerCase() === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        justCopy();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, current?.id]);

  // Reset idx kalau pindah akun
  useEffect(() => {
    setIdx(0);
  }, [selectedAccount]);

  // ============ UI: Account picker (kondisi awal, tidak ada selectedAccount) ============

  if (!selectedAccount) {
    const totalPending = accountStats.reduce((s, a) => s + a.pending, 0);

    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Link
          href={`/campaigns/${campaignId}`}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg mb-6"
        >
          <ArrowLeft className="size-4" /> Kembali ke campaign
        </Link>

        <div className="mb-8">
          <div className="text-sm text-muted">Mode Eksekusi</div>
          <h1 className="text-3xl font-bold tracking-tight">{campaignName}</h1>
          <p className="text-sm text-muted mt-2">
            Pilih akun yang <span className="text-fg">sedang kamu login di browser</span>.
            Sistem akan menampilkan komentar untuk akun itu satu per satu.
          </p>
        </div>

        {totalPending === 0 ? (
          <div className="card p-12 text-center">
            <PartyPopper className="size-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-3" />
            <h2 className="text-xl font-semibold mb-1">Semua sudah selesai!</h2>
            <p className="text-sm text-muted">
              Tidak ada antrian komentar tersisa untuk campaign ini.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {accountStats.map((a) => {
              const disabled = a.pending === 0;
              const c = colorOf(a.warna);
              return (
                <button
                  key={a.id}
                  onClick={() => !disabled && setSelectedAccount(a.id)}
                  disabled={disabled}
                  className={cn(
                    "w-full card p-4 text-left flex items-center justify-between gap-3 transition-colors relative overflow-hidden",
                    disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:border-accent hover:bg-bg-elev"
                  )}
                >
                  {/* strip warna kiri (mirip tab Firefox) */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ background: c?.hex ?? "transparent" }}
                  />
                  <div className="flex items-center gap-3 min-w-0 pl-2">
                    <div
                      className="size-10 rounded-full border border-border flex items-center justify-center shrink-0"
                      style={{
                        background: c ? `${c.hex}22` : "var(--tw-bg-bg-elev)",
                      }}
                    >
                      <User
                        className="size-5"
                        style={{ color: c?.ring ?? "#8b8b96" }}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        {a.nama}
                        {c && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full border"
                            style={{
                              background: `${c.hex}22`,
                              color: c.ring,
                              borderColor: `${c.hex}55`,
                            }}
                          >
                            container {c.label}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        {a.pending} antrian aktif · {a.total - a.pending} selesai
                        dari {a.total}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.pending > 0 ? (
                      <>
                        <span className="text-xl font-bold text-accent">
                          {a.pending}
                        </span>
                        <Play className="size-4 text-muted" />
                      </>
                    ) : (
                      <span className="badge status-selesai">selesai</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-xs text-muted leading-relaxed">
          <strong className="text-fg">Tip:</strong> buka EngageFlow di
          container Firefox yang sudah login akun FB-mu. Setiap kali tekan
          "Selesai &amp; Lanjut", sistem akan otomatis membuka link berikutnya{" "}
          <em>di container yang sama</em> — jadi langsung logged in. Tinggal paste
          &amp; post.
        </div>
      </div>
    );
  }

  // ============ UI: Selesai untuk akun ini ============

  if (currentQueue.length === 0) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <button
          onClick={() => setSelectedAccount(null)}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg mb-6"
        >
          <ArrowLeft className="size-4" /> Pilih akun lain
        </button>

        <div className="card p-12 text-center">
          <PartyPopper className="size-12 text-emerald-600 dark:text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Akun ini selesai!</h2>
          <p className="text-sm text-muted mb-6">
            Semua antrian komentar untuk akun{" "}
            <span className="text-fg font-medium">
              {accounts.find((a) => a.id === selectedAccount)?.nama}
            </span>{" "}
            sudah ditandai selesai.
          </p>
          <button
            onClick={() => setSelectedAccount(null)}
            className="btn-primary"
          >
            <ChevronLeft className="size-4" /> Pilih akun lain
          </button>
        </div>
      </div>
    );
  }

  // ============ UI: Eksekusi per assignment ============

  const accName =
    accounts.find((a) => a.id === selectedAccount)?.nama ?? "(unknown)";
  const accWarna =
    accounts.find((a) => a.id === selectedAccount)?.warna ?? null;
  const accColor = colorOf(accWarna);
  const total = currentQueue.length;
  const progress = ((idx + 1) / total) * 100;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between bg-bg-elev/60 backdrop-blur sticky top-0 z-10 relative">
        {/* strip warna container di kiri */}
        {accColor && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ background: accColor.hex }}
          />
        )}
        <div className="flex items-center gap-4 pl-2">
          <button
            onClick={() => setSelectedAccount(null)}
            className="text-muted hover:text-fg"
            title="Pilih akun lain"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <div className="text-xs text-muted">
              Mode Eksekusi · {campaignName}
            </div>
            <div className="text-sm font-medium flex items-center gap-1.5">
              <User
                className="size-3.5"
                style={{ color: accColor?.ring ?? "var(--accent)" }}
              />
              {accName}
              {accColor && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full border"
                  style={{
                    background: `${accColor.hex}22`,
                    color: accColor.ring,
                    borderColor: `${accColor.hex}55`,
                  }}
                >
                  container {accColor.label}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {idx + 1} / {total}
          </span>
          <div className="flex gap-1">
            <button
              className="btn-ghost p-1.5"
              onClick={prev}
              disabled={idx === 0}
              title="Sebelumnya (←)"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              className="btn-ghost p-1.5"
              onClick={next}
              disabled={idx >= total - 1}
              title="Berikutnya (→)"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="h-0.5 bg-bg-elev">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Banner: pastikan container & akun yang sedang aktif cocok */}
      <div
        className="border-b px-6 py-2 text-xs text-center"
        style={{
          background: accColor ? `${accColor.hex}1a` : "var(--accent-soft)",
          borderColor: accColor ? `${accColor.hex}33` : undefined,
          color: accColor?.ring ?? "var(--accent)",
        }}
      >
        <Sparkles className="size-3 inline mr-1" />
        {accColor ? (
          <>
            Pastikan EngageFlow ini terbuka di container{" "}
            <strong>{accColor.label}</strong> dan kamu sudah login sebagai{" "}
            <strong>{accName}</strong>
          </>
        ) : (
          <>
            Pastikan kamu sedang login sebagai <strong>{accName}</strong> di tab
            FB
          </>
        )}
      </div>

      {current && (
        <div className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
          {/* Card link */}
          <div className="card p-5 mb-4 animate-slide-up">
            <div className="flex items-center gap-2 mb-2">
              <span className="badge bg-bg-elev text-muted">
                {current.link_kategori}
              </span>
              <span className={cn("badge", toneBadge(current.comment_tone))}>
                {current.comment_tone}
              </span>
            </div>
            <a
              href={current.link_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-mono text-fg hover:text-accent break-all"
            >
              {current.link_url}
            </a>
          </div>

          {/* Card komentar */}
          <div className="card p-5 mb-4">
            <div className="text-xs text-muted mb-2">Komentar untuk diposting:</div>
            <p className="text-base leading-relaxed select-text">
              {current.comment_isi}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={bukaDanCopy}
              className="btn-primary flex-1 min-w-[200px] justify-center py-3 text-base"
            >
              <ExternalLink className="size-4" /> Buka Link &amp; Copy Komentar
              <span className="kbd ml-1">Enter</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={justCopy} className="btn-secondary">
              {copied ? (
                <>
                  <Check className="size-4 text-emerald-600 dark:text-emerald-400" /> Disalin
                </>
              ) : (
                <>
                  <Copy className="size-4" /> Copy saja
                  <span className="kbd ml-1">C</span>
                </>
              )}
            </button>
            <button onClick={justOpen} className="btn-secondary">
              <ExternalLink className="size-4" /> Buka saja
            </button>
            <div className="flex-1" />
            <button
              onClick={selesaiDanLanjut}
              className="btn-secondary !bg-emerald-500/15 !border-emerald-500/30 hover:!bg-emerald-500/25 text-emerald-600 dark:text-emerald-300"
            >
              <Check className="size-4" /> Selesai &amp; Lanjut
              <span className="kbd ml-1">D</span>
            </button>
          </div>

          {/* Hint */}
          <div className="text-xs text-muted text-center leading-relaxed">
            Saran jeda antar post:{" "}
            <span className="text-fg">{delayHint.label}</span> · cuma saran,
            eksekusi tetap manual
          </div>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted justify-center">
            <span>
              <span className="kbd">Enter</span> buka &amp; copy
            </span>
            <span>
              <span className="kbd">C</span> copy saja
            </span>
            <span>
              <span className="kbd">D</span> selesai &amp; lanjut
            </span>
            <span>
              <span className="kbd">←</span> <span className="kbd">→</span> navigasi
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function toneBadge(tone: string) {
  switch (tone) {
    case "pertanyaan":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20";
    case "testimoni":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20";
    case "reaksi":
      return "bg-pink-500/10 text-pink-600 dark:text-pink-300 border border-pink-500/20";
    default:
      return "bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/20";
  }
}
