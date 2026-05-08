"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function NewCampaignPage() {
  const router = useRouter();
  const [nama, setNama] = useState("");
  const [perLink, setPerLink] = useState(5);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErr("Sesi habis, silakan login ulang");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("campaigns")
      .insert({ user_id: user.id, nama, komentar_per_link: perLink })
      .select()
      .single();
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push(`/campaigns/${data.id}`);
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg mb-6"
      >
        <ArrowLeft className="size-4" /> Kembali
      </Link>

      <h1 className="text-2xl font-bold mb-1">Campaign baru</h1>
      <p className="text-sm text-muted mb-6">
        Beri nama campaign dan tentukan jumlah komentar per link
      </p>

      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        <div>
          <label className="text-xs text-muted mb-1 block">Nama campaign</label>
          <input
            className="input"
            required
            placeholder="Contoh: Promo Kacamata Mei"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-muted mb-1 block">
            Komentar per link
          </label>
          <input
            className="input"
            type="number"
            min={1}
            max={20}
            value={perLink}
            onChange={(e) => setPerLink(parseInt(e.target.value) || 1)}
          />
          <p className="text-xs text-muted mt-1">
            Berapa akun & komentar yang akan di-assign untuk tiap link.
          </p>
        </div>

        {err && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            {err}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button className="btn-primary" disabled={loading}>
            {loading ? "Menyimpan..." : "Buat campaign"}
          </button>
          <Link href="/campaigns" className="btn-ghost">
            Batal
          </Link>
        </div>
      </form>
    </div>
  );
}
