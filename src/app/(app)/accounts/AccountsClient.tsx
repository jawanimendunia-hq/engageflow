"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Users,
  ExternalLink,
  Info,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Account } from "@/lib/types";
import { CONTAINER_COLORS, colorOf } from "@/lib/colors";
import { cn } from "@/lib/utils";

const FB_URL = "https://www.facebook.com/";
const MAC_URL =
  "https://addons.mozilla.org/en-US/firefox/addon/multi-account-containers/";

export default function AccountsClient({ initial }: { initial: Account[] }) {
  const [accounts, setAccounts] = useState<Account[]>(initial);
  const [nama, setNama] = useState("");
  const [catatan, setCatatan] = useState("");
  const [warna, setWarna] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [autoOpenFb, setAutoOpenFb] = useState(true);

  // Untuk inline edit warna pada row
  const [editingId, setEditingId] = useState<string | null>(null);

  async function add() {
    if (!nama.trim()) return;
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
      .from("accounts")
      .insert({
        user_id: user.id,
        nama,
        catatan: catatan || null,
        warna: warna || null,
      })
      .select()
      .single();
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setAccounts((prev) => [...prev, data]);
    setNama("");
    setCatatan("");
    setWarna("");

    if (autoOpenFb) {
      window.open(FB_URL, "_blank", "noopener");
    }
  }

  async function remove(id: string) {
    if (!confirm("Hapus akun ini?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) return alert(error.message);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  async function updateWarna(id: string, newWarna: string | null) {
    const supabase = createClient();
    const { error } = await supabase
      .from("accounts")
      .update({ warna: newWarna })
      .eq("id", id);
    if (error) return alert(error.message);
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, warna: newWarna } : a))
    );
    setEditingId(null);
  }

  function openFb() {
    window.open(FB_URL, "_blank", "noopener");
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Users className="size-7" /> Akun
        </h1>
        <p className="text-sm text-muted mt-1">
          Daftar akun yang akan dipakai. Mesin assignment akan memilih & mengacak
          urutan akun untuk tiap link.
        </p>
      </div>

      {/* Info box: Firefox Multi-Account Containers workflow */}
      <div className="card p-4 mb-5 border-accent/20 bg-accent/5">
        <div className="flex gap-3">
          <Info className="size-4 text-accent shrink-0 mt-0.5" />
          <div className="text-xs text-muted leading-relaxed space-y-2">
            <div>
              <strong className="text-fg">
                Workflow direkomendasikan: Firefox Multi-Account Containers
              </strong>
            </div>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                Install extension{" "}
                <a
                  href={MAC_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  Firefox Multi-Account Containers
                </a>
              </li>
              <li>
                Buat 1 container per akun FB dengan warna berbeda (mis. FB-Akun-1
                merah, FB-Akun-2 biru, dst.)
              </li>
              <li>Login akun FB-mu di tiap container — sesi tersimpan persisten</li>
              <li>Login EngageFlow di tiap container (sekali per container)</li>
              <li>
                Saat eksekusi: buka EngageFlow di container akun yang ingin
                dikerjakan → sistem otomatis buka link di container yang sama →
                langsung logged in ke akun itu
              </li>
            </ol>
            <div>
              Pilih warna untuk tiap akun di bawah supaya match dengan warna
              container Firefox-nya. Warna ini akan tampil sebagai indikator saat
              mode eksekusi.
            </div>
          </div>
        </div>
      </div>

      {/* Form tambah akun */}
      <div className="card p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-2">
          <input
            className="input"
            placeholder="Nama akun (mis. Akun 1)"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <input
            className="input"
            placeholder="Catatan (opsional)"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button onClick={add} disabled={busy} className="btn-primary">
            <Plus className="size-4" /> Tambah
          </button>
        </div>

        {/* Color picker */}
        <div className="mt-3">
          <div className="text-xs text-muted mb-1.5">
            Warna container Firefox (opsional):
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ColorPicker selected={warna} onSelect={setWarna} />
          </div>
        </div>

        <label className="flex items-center gap-2 mt-3 text-xs text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoOpenFb}
            onChange={(e) => setAutoOpenFb(e.target.checked)}
            className="accent-accent"
          />
          Buka tab Facebook otomatis setelah tambah akun (di container aktif saat
          ini)
        </label>

        {err && <div className="mt-3 text-xs text-red-600 dark:text-red-400">{err}</div>}
      </div>

      <div className="flex justify-end mb-3">
        <button onClick={openFb} className="btn-ghost text-xs">
          <ExternalLink className="size-3" /> Buka Facebook di tab baru
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          Belum ada akun. Tambahkan minimal 5 akun agar engine bisa jalan dengan
          default 5 komentar/link.
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {accounts.map((a) => {
            const c = colorOf(a.warna);
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 p-4 relative"
              >
                {/* Strip warna kiri (mirip tab Firefox container) */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ background: c?.hex ?? "transparent" }}
                />

                <div className="min-w-0 flex-1 pl-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium truncate">{a.nama}</div>
                    {c && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full border"
                        style={{
                          background: `${c.hex}22`,
                          color: c.ring,
                          borderColor: `${c.hex}55`,
                        }}
                      >
                        {c.label}
                      </span>
                    )}
                  </div>
                  {a.catatan && (
                    <div className="text-xs text-muted mt-0.5 truncate">
                      {a.catatan}
                    </div>
                  )}
                  {editingId === a.id && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <ColorPicker
                        selected={a.warna ?? ""}
                        onSelect={(w) => updateWarna(a.id, w || null)}
                        small
                      />
                      <button
                        onClick={() => updateWarna(a.id, null)}
                        className="btn-ghost text-[10px] px-1.5 py-1"
                        title="Hapus warna"
                      >
                        <X className="size-3" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="btn-ghost text-[10px] px-1.5 py-1"
                      >
                        Tutup
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() =>
                      setEditingId(editingId === a.id ? null : a.id)
                    }
                    className="btn-ghost text-xs px-2 py-1"
                    title="Edit warna"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={openFb}
                    className="btn-ghost text-xs px-2 py-1"
                    title="Buka Facebook di tab baru"
                  >
                    <ExternalLink className="size-3.5" /> FB
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="text-muted hover:text-red-600 dark:text-red-400 p-1.5"
                    title="Hapus"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ColorPicker({
  selected,
  onSelect,
  small = false,
}: {
  selected: string;
  onSelect: (id: string) => void;
  small?: boolean;
}) {
  const size = small ? "size-5" : "size-7";
  return (
    <>
      {CONTAINER_COLORS.map((c) => {
        const active = selected === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(active ? "" : c.id)}
            className={cn(
              "rounded-full transition-all relative flex items-center justify-center",
              size,
              active
                ? "ring-2 ring-white ring-offset-2 ring-offset-bg-card"
                : "hover:scale-110"
            )}
            style={{ background: c.hex }}
            title={c.label}
          >
            {active && <Check className="size-3 text-white" strokeWidth={3} />}
          </button>
        );
      })}
    </>
  );
}
