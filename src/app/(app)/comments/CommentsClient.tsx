"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, MessageSquare, Filter } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Comment, Tone } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONES: Tone[] = ["pertanyaan", "santai", "testimoni", "reaksi"];

interface Props {
  initial: Comment[];
  usageMap: Record<string, number>;
}

export default function CommentsClient({ initial, usageMap }: Props) {
  const [comments, setComments] = useState<Comment[]>(initial);
  const [isi, setIsi] = useState("");
  const [kategori, setKategori] = useState("");
  const [tone, setTone] = useState<Tone>("santai");
  const [bulkText, setBulkText] = useState("");
  const [bulkKat, setBulkKat] = useState("");
  const [bulkTone, setBulkTone] = useState<Tone>("santai");
  const [filterKat, setFilterKat] = useState<string>("");
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const kategoris = useMemo(
    () => Array.from(new Set(comments.map((c) => c.kategori))).sort(),
    [comments]
  );

  const visible = useMemo(
    () => (filterKat ? comments.filter((c) => c.kategori === filterKat) : comments),
    [comments, filterKat]
  );

  const stats = useMemo(() => {
    const byKat: Record<string, number> = {};
    const byTone: Record<string, number> = {};
    for (const c of comments) {
      byKat[c.kategori] = (byKat[c.kategori] ?? 0) + 1;
      byTone[c.tone] = (byTone[c.tone] ?? 0) + 1;
    }
    return { total: comments.length, byKat, byTone };
  }, [comments]);

  async function addOne() {
    if (!isi.trim() || !kategori.trim()) {
      setErr("Isi dan kategori wajib");
      return;
    }
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setErr("Sesi habis");
      return;
    }
    const { data, error } = await supabase
      .from("comments")
      .insert({ user_id: user.id, isi, kategori, tone })
      .select()
      .single();
    setBusy(false);
    if (error) return setErr(error.message);
    setComments((prev) => [data, ...prev]);
    setIsi("");
  }

  async function addBulk() {
    if (!bulkKat.trim()) return setErr("Kategori bulk wajib diisi");
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) return;
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setErr("Sesi habis");
      return;
    }
    const rows = lines.map((isi) => ({
      user_id: user.id,
      isi,
      kategori: bulkKat.trim(),
      tone: bulkTone,
    }));
    const { data, error } = await supabase.from("comments").insert(rows).select();
    setBusy(false);
    if (error) return setErr(error.message);
    setComments((prev) => [...(data ?? []), ...prev]);
    setBulkText("");
  }

  async function remove(id: string) {
    if (!confirm("Hapus komentar ini?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) return alert(error.message);
    setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquare className="size-7" /> Komentar
        </h1>
        <p className="text-sm text-muted mt-1">
          Template komentar berbasis kategori. Engine hanya mengambil komentar
          dengan kategori yang sama dengan link.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Total" value={stats.total} />
        <Stat label="Kategori" value={Object.keys(stats.byKat).length} />
        <Stat label="Pertanyaan" value={stats.byTone["pertanyaan"] ?? 0} />
        <Stat label="Testimoni" value={stats.byTone["testimoni"] ?? 0} />
      </div>

      {/* Form tambah satu */}
      <div className="card p-5 mb-4 space-y-3">
        <h3 className="text-sm font-semibold">Tambah satu komentar</h3>
        <textarea
          className="input min-h-[70px]"
          placeholder="Isi komentar..."
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
        />
        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2">
          <input
            className="input"
            placeholder="kategori (mis. kacamata)"
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
          />
          <select
            className="input"
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
          >
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button onClick={addOne} disabled={busy} className="btn-primary">
            <Plus className="size-4" /> Tambah
          </button>
        </div>
        {err && <div className="text-xs text-red-600 dark:text-red-400">{err}</div>}
      </div>

      {/* Toggle bulk */}
      <div className="mb-4">
        <button
          onClick={() => setShowBulk((s) => !s)}
          className="btn-ghost text-xs"
        >
          {showBulk ? "Sembunyikan" : "Tampilkan"} bulk import
        </button>
      </div>

      {showBulk && (
        <div className="card p-5 mb-6 space-y-3">
          <h3 className="text-sm font-semibold">Bulk import komentar</h3>
          <p className="text-xs text-muted">
            Satu komentar per baris. Semua akan disimpan dengan kategori & tone yang
            sama.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              className="input"
              placeholder="kategori (wajib)"
              value={bulkKat}
              onChange={(e) => setBulkKat(e.target.value)}
            />
            <select
              className="input"
              value={bulkTone}
              onChange={(e) => setBulkTone(e.target.value as Tone)}
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="input min-h-[160px] font-mono text-xs"
            placeholder={"keren bgt!\nudah pernah cobain belum?\nmurah banget ini sih..."}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <button onClick={addBulk} disabled={busy} className="btn-secondary">
            Import bulk
          </button>
        </div>
      )}

      {/* Filter */}
      {kategoris.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Filter className="size-4 text-muted" />
          <button
            onClick={() => setFilterKat("")}
            className={cn(
              "badge cursor-pointer",
              !filterKat ? "bg-accent/20 text-fg border border-accent/30" : "bg-bg-elev text-muted"
            )}
          >
            Semua ({stats.total})
          </button>
          {kategoris.map((k) => (
            <button
              key={k}
              onClick={() => setFilterKat(k === filterKat ? "" : k)}
              className={cn(
                "badge cursor-pointer",
                filterKat === k
                  ? "bg-accent/20 text-fg border border-accent/30"
                  : "bg-bg-elev text-muted"
              )}
            >
              {k} ({stats.byKat[k]})
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card p-10 text-center text-muted">Belum ada komentar.</div>
      ) : (
        <div className="card divide-y divide-border">
          {visible.map((c) => (
            <div key={c.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">{c.isi}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="badge bg-bg-elev text-muted">{c.kategori}</span>
                  <span className={cn("badge", toneBadge(c.tone))}>{c.tone}</span>
                  <span className="text-[10px] text-muted/70">
                    dipakai {usageMap[c.id] ?? 0}x
                  </span>
                </div>
              </div>
              <button
                onClick={() => remove(c.id)}
                className="text-muted hover:text-red-600 dark:text-red-400 p-1 shrink-0"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
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
