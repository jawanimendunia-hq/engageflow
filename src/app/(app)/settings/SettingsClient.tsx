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
  Zap,
  Power,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, cn } from "@/lib/utils";
import {
  PROVIDER_LABELS,
  PROVIDER_LIST,
  PROVIDER_MODEL_OPTIONS,
  type ProviderName,
} from "@/lib/ai";

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

export interface AiCredInitial {
  provider: ProviderName;
  hasKey: boolean;
  model: string;
  priority: number | null;
  enabled: boolean;
  lastUsed: string | null;
  updatedAt: string | null;
}

interface Props {
  initialCreds: Credential[];
  initialSkus: Sku[];
  aiInitial: AiCredInitial[];
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
          Integrasi Meta Ads, AI Multi-Provider, dan kamus SKU
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

const PROVIDER_HOWTO: Record<
  ProviderName,
  { url: string; placeholder: string; instructions: string[]; freeTier: string }
> = {
  gemini: {
    url: "https://aistudio.google.com/apikey",
    placeholder: "AIzaSy...",
    instructions: [
      "Buka Google AI Studio → klik 'Create API key'",
      "Pilih project (atau buat baru) → Copy key",
    ],
    freeTier: "Free: 15 req/menit, 1500/hari (gemini-2.5-flash)",
  },
  cerebras: {
    url: "https://cloud.cerebras.ai/platform/",
    placeholder: "csk-...",
    instructions: [
      "Daftar di cloud.cerebras.ai → menu 'API Keys'",
      "Klik 'Create API key' → Copy key (csk-...)",
    ],
    freeTier: "Free: ~30 req/menit, 14400/hari (llama-3.3-70b)",
  },
  groq: {
    url: "https://console.groq.com/keys",
    placeholder: "gsk_...",
    instructions: [
      "Daftar di console.groq.com → menu 'API Keys'",
      "Klik 'Create API Key' → Copy key (gsk_...)",
    ],
    freeTier: "Free: 30 req/menit, 14400 token/menit (llama-3.3-70b)",
  },
};

function AiSection({ initial }: { initial: AiCredInitial[] }) {
  const [creds, setCreds] = useState<AiCredInitial[]>(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  function notify(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 6000);
  }

  function updateCred(provider: ProviderName, patch: Partial<AiCredInitial>) {
    setCreds((prev) =>
      prev.map((c) => (c.provider === provider ? { ...c, ...patch } : c))
    );
  }

  // Sorting by priority for display
  const sortedCreds = [...creds].sort((a, b) => {
    // hasKey duluan, lalu by priority
    if (a.hasKey !== b.hasKey) return a.hasKey ? -1 : 1;
    return (a.priority ?? 999) - (b.priority ?? 999);
  });

  const activeCount = creds.filter((c) => c.hasKey && c.enabled).length;
  const rotationOrder = creds
    .filter((c) => c.hasKey && c.enabled)
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
    .map((c) => PROVIDER_LABELS[c.provider]);

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="size-5 text-accent" /> AI Multi-Provider
          </h2>
          <p className="text-sm text-muted mt-0.5">
            Hubungkan Gemini, Cerebras, dan Groq — sistem akan rotasi otomatis
            saat ada yang habis limit.
          </p>
        </div>
        {activeCount > 0 && (
          <span className="badge status-selesai shrink-0">
            <Check className="size-3 mr-1" /> {activeCount} aktif
          </span>
        )}
      </div>

      {/* Rotation order display */}
      {rotationOrder.length > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-accent/5 border border-accent/20 text-xs">
          <div className="font-semibold text-fg flex items-center gap-1.5 mb-1.5">
            <Zap className="size-3.5 text-accent" />
            Urutan rotasi (priority ascending):
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {rotationOrder.map((label, i) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="badge bg-bg-elev text-fg">{i + 1}. {label}</span>
                {i < rotationOrder.length - 1 && (
                  <span className="text-muted">→</span>
                )}
              </span>
            ))}
          </div>
          <p className="text-muted mt-1.5">
            Jika provider pertama rate-limited / gagal, otomatis pindah ke provider berikutnya.
          </p>
        </div>
      )}

      {msg && (
        <div
          className={cn(
            "mt-4 text-xs rounded-md px-3 py-2 border flex items-start gap-2",
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

      <div className="space-y-3 mt-4">
        {sortedCreds.map((cred) => (
          <ProviderRow
            key={cred.provider}
            cred={cred}
            onUpdate={(patch) => updateCred(cred.provider, patch)}
            onNotify={notify}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderRow({
  cred,
  onUpdate,
  onNotify,
}: {
  cred: AiCredInitial;
  onUpdate: (patch: Partial<AiCredInitial>) => void;
  onNotify: (kind: "ok" | "err", text: string) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(
    cred.model || PROVIDER_MODEL_OPTIONS[cred.provider][0].value
  );
  const [showKey, setShowKey] = useState(false);
  const [expanded, setExpanded] = useState(!cred.hasKey);
  const [busy, setBusy] = useState<null | "save" | "test" | "delete" | "toggle" | "priority" | "model">(
    null
  );

  const howto = PROVIDER_HOWTO[cred.provider];
  const label = PROVIDER_LABELS[cred.provider];

  async function save() {
    if (!apiKey.trim() && !cred.hasKey) {
      onNotify("err", `API key ${label} wajib`);
      return;
    }
    setBusy("save");
    const r = await fetch("/api/ai/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: cred.provider,
        api_key: apiKey.trim(),
        model,
      }),
    });
    const d = await r.json();
    setBusy(null);
    if (!r.ok) {
      onNotify("err", d.error ?? "Gagal");
      return;
    }
    onNotify("ok", `✓ ${label} tersambung. Reply: "${d.reply}"`);
    onUpdate({
      hasKey: true,
      model,
      updatedAt: new Date().toISOString(),
      enabled: true,
    });
    setApiKey("");
    setExpanded(false);
  }

  async function testNow() {
    setBusy("test");
    const r = await fetch(`/api/ai/test?provider=${cred.provider}`);
    const d = await r.json();
    setBusy(null);
    if (!r.ok) {
      onNotify("err", d.error ?? "Gagal");
      return;
    }
    onNotify("ok", `✓ ${label} (${d.model}) merespons: "${d.reply}"`);
  }

  async function unlink() {
    if (!confirm(`Hapus API key ${label}?`)) return;
    setBusy("delete");
    const r = await fetch(`/api/ai/save?provider=${cred.provider}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (!r.ok) {
      onNotify("err", "Gagal");
      return;
    }
    onUpdate({
      hasKey: false,
      lastUsed: null,
      updatedAt: null,
      enabled: true,
    });
    setApiKey("");
    setExpanded(true);
    onNotify("ok", `${label} dihapus`);
  }

  async function toggleEnabled() {
    setBusy("toggle");
    const newEnabled = !cred.enabled;
    const r = await fetch("/api/ai/save", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: cred.provider, enabled: newEnabled }),
    });
    setBusy(null);
    if (!r.ok) {
      onNotify("err", "Gagal");
      return;
    }
    onUpdate({ enabled: newEnabled });
    onNotify("ok", `${label} ${newEnabled ? "diaktifkan" : "dinonaktifkan"}`);
  }

  async function changePriority(delta: number) {
    setBusy("priority");
    const newPriority = (cred.priority ?? 50) + delta;
    const r = await fetch("/api/ai/save", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: cred.provider,
        priority: newPriority,
      }),
    });
    setBusy(null);
    if (!r.ok) {
      onNotify("err", "Gagal");
      return;
    }
    onUpdate({ priority: newPriority });
  }

  async function changeModel(newModel: string) {
    setModel(newModel);
    if (!cred.hasKey) return; // belum tersimpan, simpan via Save
    setBusy("model");
    const r = await fetch("/api/ai/save", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: cred.provider,
        model: newModel,
      }),
    });
    setBusy(null);
    if (!r.ok) {
      onNotify("err", "Gagal update model");
      return;
    }
    onUpdate({ model: newModel });
  }

  return (
    <div
      className={cn(
        "card p-4",
        cred.hasKey && cred.enabled && "border-accent/30",
        cred.hasKey && !cred.enabled && "opacity-60"
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "size-9 rounded-lg flex items-center justify-center shrink-0",
            cred.hasKey
              ? cred.enabled
                ? "bg-accent/10 text-accent"
                : "bg-bg-elev text-muted"
              : "bg-bg-elev text-muted"
          )}
        >
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{label}</span>
            {cred.hasKey ? (
              cred.enabled ? (
                <span className="badge status-selesai text-[10px]">aktif</span>
              ) : (
                <span className="badge status-pending text-[10px]">nonaktif</span>
              )
            ) : (
              <span className="badge bg-bg-elev text-muted text-[10px]">
                belum di-set
              </span>
            )}
            {cred.hasKey && cred.priority !== null && (
              <span className="text-[10px] text-muted">
                priority {cred.priority}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted">{howto.freeTier}</div>
        </div>

        {/* Priority controls + power toggle */}
        {cred.hasKey && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => changePriority(-10)}
              disabled={busy !== null}
              title="Naikkan priority (rotasi duluan)"
              className="btn-ghost p-1.5"
            >
              <ArrowUp className="size-3.5" />
            </button>
            <button
              onClick={() => changePriority(10)}
              disabled={busy !== null}
              title="Turunkan priority"
              className="btn-ghost p-1.5"
            >
              <ArrowDown className="size-3.5" />
            </button>
            <button
              onClick={toggleEnabled}
              disabled={busy !== null}
              title={cred.enabled ? "Nonaktifkan" : "Aktifkan"}
              className={cn(
                "btn-ghost p-1.5",
                cred.enabled
                  ? "text-emerald-600"
                  : "text-muted"
              )}
            >
              {busy === "toggle" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Power className="size-3.5" />
              )}
            </button>
          </div>
        )}

        <button
          onClick={() => setExpanded((e) => !e)}
          className="btn-ghost p-1.5 shrink-0"
          title={expanded ? "Tutup" : "Edit"}
        >
          {expanded ? (
            <X className="size-4" />
          ) : (
            <Pencil className="size-3.5" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {/* How to */}
          <div className="p-2.5 rounded-lg bg-bg-elev border border-border text-[11px] leading-relaxed text-muted">
            <div className="font-semibold text-fg flex items-center gap-1.5 mb-1">
              <AlertTriangle className="size-3 text-amber-500" />
              Cara dapat API key gratis:
            </div>
            <ol className="list-decimal pl-4 space-y-0.5">
              {howto.instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
              <li>
                <a
                  href={howto.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline inline-flex items-center gap-0.5"
                >
                  {howto.url} <ExternalLink className="size-3" />
                </a>
              </li>
            </ol>
          </div>

          {/* API Key input */}
          <div>
            <label className="text-xs text-muted block mb-1">
              API Key{" "}
              {cred.hasKey && (
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
                placeholder={
                  cred.hasKey ? "•••••• (kosongkan jika tidak ganti)" : howto.placeholder
                }
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
                tabIndex={-1}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {/* Model selection */}
          <div>
            <label className="text-xs text-muted block mb-1">Model</label>
            <select
              className="input"
              value={model}
              onChange={(e) => changeModel(e.target.value)}
              disabled={busy !== null}
            >
              {PROVIDER_MODEL_OPTIONS[cred.provider].map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={save}
              disabled={busy !== null || (!apiKey.trim() && !cred.hasKey)}
              className="btn-primary"
            >
              {busy === "save" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : cred.hasKey ? (
                "Update"
              ) : (
                "Simpan & test"
              )}
            </button>
            {cred.hasKey && (
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

          {/* Meta info */}
          {cred.hasKey && (
            <div className="text-[11px] text-muted pt-2 border-t border-border space-y-0.5">
              {cred.updatedAt && <div>Disimpan: {fmtDate(cred.updatedAt)}</div>}
              {cred.lastUsed && <div>Terakhir dipakai: {fmtDate(cred.lastUsed)}</div>}
            </div>
          )}
        </div>
      )}
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
