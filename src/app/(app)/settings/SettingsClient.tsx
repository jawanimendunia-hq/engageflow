"use client";

import { useState } from "react";
import {
  Settings as SettingsIcon,
  KeyRound,
  Tag,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Eye,
  EyeOff,
  Pencil,
  X,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, cn } from "@/lib/utils";

interface Credential {
  id: string;
  label: string | null;
  ad_account_id: string;
  last_used_at: string | null;
  updated_at: string | null;
  created_at: string | null;
}

interface Sku {
  id: string;
  kode: string;
  kategori: string;
}

interface AiInitial {
  hasKey: boolean;
  model: string;
  lastUsed: string | null;
  updatedAt: string | null;
}

interface Props {
  initialCreds: Credential[];
  initialSkus: Sku[];
  aiInitial: AiInitial;
}

export default function SettingsClient({
  initialCreds,
  initialSkus,
  aiInitial,
}: Props) {
  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="size-7" /> Settings
        </h1>
        <p className="text-sm text-muted mt-1">
          Integrasi Meta Ads, AI Gemini, dan kamus SKU
        </p>
      </div>

      <MetaSection initial={initialCreds} />
      <AiSection initial={aiInitial} />
      <SkuSection initialSkus={initialSkus} />
    </div>
  );
}

// =================== META SECTION ===================

function MetaSection({ initial }: { initial: Credential[] }) {
  const [creds, setCreds] = useState<Credential[]>(initial);
  const [showAdd, setShowAdd] = useState(initial.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  function notify(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 6000);
  }

  async function refreshList() {
    const r = await fetch("/api/meta/credentials");
    const d = await r.json();
    if (r.ok) setCreds(d.data ?? []);
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <KeyRound className="size-5" /> Meta Ads Integration
          </h2>
          <p className="text-sm text-muted mt-0.5">
            Hubungkan satu atau banyak Ad Account. Saat import, kamu pilih dari ad account mana.
          </p>
        </div>
        <span className="badge bg-bg-elev text-muted shrink-0">
          {creds.length} ad account
        </span>
      </div>

      {/* Cara dapat token (collapsed kecil) */}
      <div className="mt-4 mb-4 p-3 rounded-lg bg-bg-elev border border-border text-xs leading-relaxed text-muted">
        <div className="font-semibold text-fg flex items-center gap-1.5 mb-1.5">
          <AlertTriangle className="size-3.5 text-amber-500" />
          Cara dapat access token:
        </div>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>
            Buka{" "}
            <a
              href="https://developers.facebook.com/tools/explorer/"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline inline-flex items-center gap-0.5"
            >
              Graph API Explorer <ExternalLink className="size-3" />
            </a>{" "}
            → pilih app kamu → <strong className="text-fg">ads_read</strong> → Generate
          </li>
          <li>
            Extend ke 60 hari di{" "}
            <a
              href="https://developers.facebook.com/tools/debug/accesstoken/"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline inline-flex items-center gap-0.5"
            >
              Access Token Debugger <ExternalLink className="size-3" />
            </a>
          </li>
          <li>
            Ad Account ID: dari URL Ads Manager (<code className="text-fg">act=12345...</code>),
            ambil angkanya
          </li>
        </ol>
      </div>

      {msg && (
        <div
          className={cn(
            "mb-4 text-xs rounded-md px-3 py-2 border flex items-start gap-2",
            msg.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
              : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
          )}
        >
          {msg.kind === "ok" ? (
            <Check className="size-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          )}
          <span className="break-words">{msg.text}</span>
        </div>
      )}

      {/* Daftar credential */}
      {creds.length > 0 && (
        <div className="space-y-2 mb-4">
          {creds.map((c) => (
            <CredentialRow
              key={c.id}
              cred={c}
              isEditing={editingId === c.id}
              onEdit={() => setEditingId(editingId === c.id ? null : c.id)}
              onSaved={async () => {
                await refreshList();
                setEditingId(null);
                notify("ok", "Credential ter-update");
              }}
              onDeleted={async () => {
                await refreshList();
                notify("ok", "Credential dihapus");
              }}
              onError={(e) => notify("err", e)}
            />
          ))}
        </div>
      )}

      {/* Add new */}
      {showAdd ? (
        <AddCredentialForm
          onSaved={async (label) => {
            await refreshList();
            setShowAdd(false);
            notify("ok", `"${label}" tersambung`);
          }}
          onCancel={() => creds.length > 0 && setShowAdd(false)}
          showCancel={creds.length > 0}
          onError={(e) => notify("err", e)}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="btn-secondary w-full justify-center"
        >
          <Plus className="size-4" /> Tambah ad account
        </button>
      )}
    </div>
  );
}

function AddCredentialForm({
  onSaved,
  onCancel,
  showCancel,
  onError,
}: {
  onSaved: (label: string) => void | Promise<void>;
  onCancel: () => void;
  showCancel: boolean;
  onError: (msg: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [accId, setAccId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!token.trim() || !accId.trim()) {
      onError("Token & Ad Account ID wajib");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/meta/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim() || null,
        access_token: token.trim(),
        ad_account_id: accId.trim().replace(/^act_/, ""),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      onError(data.error ?? "Gagal");
      return;
    }
    onSaved(label.trim() || data.account_name || `act_${accId.trim()}`);
    setLabel("");
    setToken("");
    setAccId("");
  }

  return (
    <div className="card border-accent/30 bg-accent/5 p-4 space-y-3">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Plus className="size-4" /> Tambah ad account baru
      </div>

      <div>
        <label className="text-xs text-muted block mb-1">
          Label (opsional, untuk kamu kenali)
        </label>
        <input
          className="input"
          placeholder="mis. Akun Brand A · Akun Reseller · dst"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs text-muted block mb-1">Access Token</label>
        <div className="relative">
          <input
            type={showToken ? "text" : "password"}
            className="input pr-10 font-mono text-xs"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="EAAxxxxxx..."
          />
          <button
            type="button"
            onClick={() => setShowToken((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
            tabIndex={-1}
          >
            {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted block mb-1">Ad Account ID</label>
        <input
          className="input font-mono text-sm"
          value={accId}
          onChange={(e) => setAccId(e.target.value)}
          placeholder="123456789012345 (tanpa prefix act_)"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={busy} className="btn-primary">
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Simpan & test"}
        </button>
        {showCancel && (
          <button onClick={onCancel} className="btn-ghost">
            Batal
          </button>
        )}
      </div>
    </div>
  );
}

function CredentialRow({
  cred,
  isEditing,
  onEdit,
  onSaved,
  onDeleted,
  onError,
}: {
  cred: Credential;
  isEditing: boolean;
  onEdit: () => void;
  onSaved: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [label, setLabel] = useState(cred.label ?? "");
  const [token, setToken] = useState("");
  const [accId, setAccId] = useState(cred.ad_account_id);
  const [busy, setBusy] = useState<null | "test" | "save" | "delete">(null);

  async function test() {
    setBusy("test");
    const r = await fetch(`/api/meta/test?cred_id=${cred.id}`);
    const d = await r.json();
    setBusy(null);
    if (!r.ok) onError(d.error ?? "Gagal");
    else onError(`✓ Tersambung ke "${d.account_name}"`);
  }

  async function save() {
    setBusy("save");
    const r = await fetch("/api/meta/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: cred.id,
        label: label.trim() || null,
        access_token: token.trim() || undefined,
        ad_account_id: accId.trim().replace(/^act_/, ""),
      }),
    });
    const d = await r.json();
    setBusy(null);
    if (!r.ok) {
      onError(d.error ?? "Gagal");
      return;
    }
    setToken("");
    onSaved();
  }

  async function del() {
    if (!confirm(`Hapus credential "${cred.label ?? cred.ad_account_id}"?`))
      return;
    setBusy("delete");
    const r = await fetch(`/api/meta/credentials?id=${cred.id}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (!r.ok) {
      const d = await r.json();
      onError(d.error ?? "Gagal");
      return;
    }
    onDeleted();
  }

  if (isEditing) {
    return (
      <div className="card border-accent/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Edit credential</div>
          <button onClick={onEdit} className="btn-ghost p-1.5">
            <X className="size-4" />
          </button>
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">Label</label>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="mis. Akun Brand A"
          />
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">
            Access Token{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              (kosongkan jika tidak ganti)
            </span>
          </label>
          <input
            type="password"
            className="input font-mono text-xs"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="kosongkan jika tidak ganti"
          />
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">Ad Account ID</label>
          <input
            className="input font-mono text-sm"
            value={accId}
            onChange={(e) => setAccId(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={save} disabled={busy !== null} className="btn-primary">
            {busy === "save" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Simpan perubahan"
            )}
          </button>
          <button onClick={onEdit} className="btn-ghost">
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="size-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
        <KeyRound className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm truncate">
          {cred.label ?? <span className="text-muted">Tanpa label</span>}
        </div>
        <div className="text-[11px] text-muted font-mono truncate">
          act_{cred.ad_account_id}
          {cred.last_used_at && ` · dipakai ${fmtDate(cred.last_used_at)}`}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={test}
          disabled={busy !== null}
          className="btn-ghost text-xs px-2 py-1"
          title="Test connection"
        >
          {busy === "test" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            "Test"
          )}
        </button>
        <button
          onClick={onEdit}
          className="btn-ghost text-xs px-2 py-1"
          title="Edit"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          onClick={del}
          disabled={busy !== null}
          className="text-muted hover:text-red-500 p-1.5"
          title="Hapus"
        >
          {busy === "delete" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}

// =================== AI SECTION ===================

function AiSection({ initial }: { initial: AiInitial }) {
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [model, setModel] = useState(initial.model);
  const [lastUsed, setLastUsed] = useState(initial.lastUsed);
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "test" | "delete">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  function notify(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 6000);
  }

  async function save() {
    if (!apiKey.trim() && !hasKey) {
      notify("err", "API key wajib");
      return;
    }
    setBusy("save");
    const r = await fetch("/api/ai/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey.trim() || undefined,
        model,
      }),
    });
    const d = await r.json();
    setBusy(null);
    if (!r.ok) {
      notify("err", d.error ?? "Gagal");
      return;
    }
    notify("ok", `✓ Tersambung. Reply test: "${d.reply}"`);
    setHasKey(true);
    setApiKey("");
    setUpdatedAt(new Date().toISOString());
  }

  async function testNow() {
    setBusy("test");
    const r = await fetch("/api/ai/test");
    const d = await r.json();
    setBusy(null);
    if (!r.ok) {
      notify("err", d.error ?? "Gagal");
      return;
    }
    notify("ok", `✓ ${d.model} merespons: "${d.reply}"`);
  }

  async function unlink() {
    if (!confirm("Hapus API key Gemini?")) return;
    setBusy("delete");
    const r = await fetch("/api/ai/save", { method: "DELETE" });
    setBusy(null);
    if (!r.ok) {
      notify("err", "Gagal");
      return;
    }
    setHasKey(false);
    setLastUsed(null);
    setUpdatedAt(null);
    notify("ok", "API key dihapus");
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="size-5 text-accent" /> AI Generator (Gemini)
          </h2>
          <p className="text-sm text-muted mt-0.5">
            Generate komentar otomatis pakai Gemini API saat import dari Meta Ads
          </p>
        </div>
        {hasKey && (
          <span className="badge status-selesai shrink-0">
            <Check className="size-3 mr-1" /> aktif
          </span>
        )}
      </div>

      {/* How to */}
      <div className="mt-4 mb-4 p-3 rounded-lg bg-bg-elev border border-border text-xs leading-relaxed text-muted">
        <div className="font-semibold text-fg flex items-center gap-1.5 mb-1.5">
          <AlertTriangle className="size-3.5 text-amber-500" />
          Dapat API key gratis:
        </div>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>
            Buka{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline inline-flex items-center gap-0.5"
            >
              Google AI Studio <ExternalLink className="size-3" />
            </a>
          </li>
          <li>
            Klik <strong className="text-fg">Create API key</strong> → pilih project
          </li>
          <li>Copy key (formatnya <code className="text-fg">AIzaSy...</code>)</li>
          <li>
            Free tier 2.5 Flash: 15 req/menit, 1500/hari. Cukup untuk pemakaian
            normal.
          </li>
        </ol>
      </div>

      {msg && (
        <div
          className={cn(
            "mb-4 text-xs rounded-md px-3 py-2 border flex items-start gap-2",
            msg.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
              : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
          )}
        >
          {msg.kind === "ok" ? (
            <Check className="size-4 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          )}
          <span className="break-words">{msg.text}</span>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted block mb-1">
            API Key{" "}
            {hasKey && (
              <span className="text-emerald-600 dark:text-emerald-400">
                (tersimpan, kosongkan jika tidak ganti)
              </span>
            )}
          </label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              className="input pr-10 font-mono text-xs"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? "•••••••••••• (kosongkan jika tidak ganti)" : "AIzaSy..."}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
              tabIndex={-1}
            >
              {showKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted block mb-1">Model</label>
          <select
            className="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="gemini-2.5-flash">
              gemini-2.5-flash (15 RPM, 1500/hari) — direkomendasikan
            </option>
            <option value="gemini-2.5-flash-lite">
              gemini-2.5-flash-lite (lebih cepat, kualitas lebih rendah)
            </option>
            <option value="gemini-2.5-pro">
              gemini-2.5-pro (kualitas terbaik, free tier 2 RPM, 50/hari)
            </option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={save} disabled={busy !== null} className="btn-primary">
            {busy === "save" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : hasKey ? (
              "Update"
            ) : (
              "Simpan & test"
            )}
          </button>
          {hasKey && (
            <>
              <button
                onClick={testNow}
                disabled={busy !== null}
                className="btn-secondary"
              >
                {busy === "test" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Test"
                )}
              </button>
              <button
                onClick={unlink}
                disabled={busy !== null}
                className="btn-ghost text-red-500"
              >
                {busy === "delete" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Hapus"
                )}
              </button>
            </>
          )}
        </div>

        {hasKey && (
          <div className="text-xs text-muted pt-2 border-t border-border space-y-0.5">
            {updatedAt && <div>Disimpan: {fmtDate(updatedAt)}</div>}
            {lastUsed && <div>Terakhir dipakai: {fmtDate(lastUsed)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// =================== SKU SECTION ===================

function SkuSection({ initialSkus }: { initialSkus: Sku[] }) {
  const [skus, setSkus] = useState<Sku[]>(initialSkus);
  const [kode, setKode] = useState("");
  const [kategori, setKategori] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  function notify(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function add() {
    if (!kode.trim() || !kategori.trim()) {
      notify("err", "Kode & kategori wajib");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }
    const { data, error } = await supabase
      .from("sku_mappings")
      .insert({
        user_id: user.id,
        kode: kode.trim().toUpperCase(),
        kategori: kategori.trim(),
      })
      .select()
      .single();
    setBusy(false);
    if (error) {
      notify("err", error.message);
      return;
    }
    setSkus((p) => [...p, data].sort((a, b) => a.kode.localeCompare(b.kode)));
    setKode("");
    setKategori("");
    notify("ok", "SKU ditambahkan");
  }

  async function remove(id: string) {
    if (!confirm("Hapus mapping ini?")) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("sku_mappings")
      .delete()
      .eq("id", id);
    if (error) {
      notify("err", error.message);
      return;
    }
    setSkus((p) => p.filter((s) => s.id !== id));
  }

  async function importBulk() {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const parsed: { kode: string; kategori: string }[] = [];
    for (const l of lines) {
      const m = l.match(/^([A-Za-z0-9_-]+)\s*[=,|:]\s*(.+)$/);
      if (m) {
        parsed.push({ kode: m[1].toUpperCase(), kategori: m[2].trim() });
      }
    }
    if (parsed.length === 0) {
      notify("err", "Format tidak valid. Contoh: KCM=kacamata");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }
    const rows = parsed.map((p) => ({
      user_id: user.id,
      kode: p.kode,
      kategori: p.kategori,
    }));
    const { data, error } = await supabase
      .from("sku_mappings")
      .upsert(rows, { onConflict: "user_id,kode" })
      .select();
    setBusy(false);
    if (error) {
      notify("err", error.message);
      return;
    }
    const map = new Map(skus.map((s) => [s.kode, s]));
    for (const d of data ?? []) map.set(d.kode, d);
    setSkus(
      Array.from(map.values()).sort((a, b) => a.kode.localeCompare(b.kode))
    );
    setBulkText("");
    notify("ok", `${data?.length ?? 0} mapping disimpan`);
  }

  return (
    <div className="card p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Tag className="size-5" /> SKU Dictionary
        </h2>
        <p className="text-sm text-muted mt-0.5">
          Kamus kode SKU → kategori. Saat import dari Meta, kode di nama
          campaign/ad akan dideteksi otomatis.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_auto] gap-2 mb-3">
        <input
          className="input font-mono uppercase"
          placeholder="KCM"
          value={kode}
          onChange={(e) => setKode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          maxLength={20}
        />
        <input
          className="input"
          placeholder="kacamata"
          value={kategori}
          onChange={(e) => setKategori(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button onClick={add} disabled={busy} className="btn-primary">
          <Plus className="size-4" /> Tambah
        </button>
      </div>

      <button
        onClick={() => setShowBulk((s) => !s)}
        className="btn-ghost text-xs mb-3"
      >
        {showBulk ? "Tutup" : "Tampilkan"} bulk import
      </button>

      {showBulk && (
        <div className="mb-4 p-4 rounded-lg bg-bg-elev border border-border space-y-2">
          <p className="text-xs text-muted">
            Satu mapping per baris. Format:{" "}
            <code className="text-fg">KODE=kategori</code> atau{" "}
            <code className="text-fg">KODE,kategori</code>
          </p>
          <textarea
            className="input min-h-[120px] font-mono text-xs"
            placeholder={"KCM=kacamata\nMDK=minyak dayak\nSKC=skincare\nFCI=facial-ice"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <button onClick={importBulk} disabled={busy} className="btn-secondary">
            Import bulk
          </button>
        </div>
      )}

      {msg && (
        <div
          className={cn(
            "text-xs rounded-md px-3 py-2 border mb-3",
            msg.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
              : "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20"
          )}
        >
          {msg.text}
        </div>
      )}

      {skus.length === 0 ? (
        <div className="text-sm text-muted text-center py-8 border-t border-border">
          Belum ada mapping
        </div>
      ) : (
        <div className="border-t border-border -mx-6 -mb-6 overflow-hidden rounded-b-xl">
          <div className="grid grid-cols-[140px_1fr_44px] gap-3 px-6 py-2 text-xs text-muted bg-bg-elev/40">
            <div>Kode</div>
            <div>Kategori</div>
            <div></div>
          </div>
          <div className="divide-y divide-border">
            {skus.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[140px_1fr_44px] gap-3 px-6 py-2.5 items-center"
              >
                <div className="font-mono font-semibold text-sm">{s.kode}</div>
                <div className="text-sm">{s.kategori}</div>
                <button
                  onClick={() => remove(s.id)}
                  className="text-muted hover:text-red-500 p-1"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
