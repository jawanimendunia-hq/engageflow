"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { AuthShowcase } from "@/components/AuthShowcase";

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
    <main className="auth-shell">
      <AuthShowcase />
      <section className="auth-form-wrap">
      <form onSubmit={onSubmit} className="auth-form">
        <Link href="/" className="brand-lockup" aria-label="Kembali ke beranda">
          <span className="brand-mark"><Logo size={25} className="text-fg" /></span>
          <span className="brand-name">engageflow</span>
        </Link>

        <h1 className="mb-2">Buat workspace</h1>
        <p className="mb-8 text-sm text-muted">Mulai organisir komentar dengan alur yang lebih rapi.</p>

        <label className="mb-1.5 block text-xs font-medium">Email</label>
        <input
          className="input mb-4"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="mb-1.5 block text-xs font-medium">Password (min. 6 karakter)</label>
        <input
          className="input mb-4"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {err && (
          <div className="mb-4 rounded-2xl border border-[#f34646]/30 bg-[#f34646]/10 px-3 py-2 text-xs text-[#c52f2f]">
            {err}
          </div>
        )}
        {msg && (
          <div className="mb-4 rounded-2xl border border-[#466cf3]/30 bg-[#466cf3]/10 px-3 py-2 text-[#2447c5] text-xs">
            {msg}
          </div>
        )}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Memproses..." : "Daftar"}
        </button>

        <p className="mt-6 text-center text-xs text-muted">
          Sudah punya akun?{" "}
          <Link href="/login" className="font-semibold text-fg underline decoration-[#e6e51e] decoration-4 underline-offset-2">
            Masuk
          </Link>
        </p>
      </form>
      </section>
    </main>
  );
}
