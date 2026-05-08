"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setMsg(
        "Akun dibuat. Cek email kamu untuk verifikasi (jika konfirmasi email aktif di Supabase)."
      );
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={onSubmit} className="card p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">Daftar</h1>
        <p className="text-sm text-muted mb-6">Buat workspace pribadi kamu</p>

        <label className="text-xs text-muted mb-1 block">Email</label>
        <input
          className="input mb-3"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="text-xs text-muted mb-1 block">Password (min 6)</label>
        <input
          className="input mb-4"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {err && (
          <div className="mb-4 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            {err}
          </div>
        )}
        {msg && (
          <div className="mb-4 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
            {msg}
          </div>
        )}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Memproses..." : "Daftar"}
        </button>

        <p className="text-xs text-muted mt-6 text-center">
          Sudah punya akun?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Masuk
          </Link>
        </p>
      </form>
    </main>
  );
}
