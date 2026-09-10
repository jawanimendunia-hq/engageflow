"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { AuthShowcase } from "@/components/AuthShowcase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
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

        <h1 className="mb-2">Selamat datang</h1>
        <p className="mb-8 text-sm text-muted">Masuk untuk melanjutkan workflow komentarmu.</p>

        <label className="mb-1.5 block text-xs font-medium">Email</label>
        <input
          className="input mb-4"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="kamu@email.com"
        />

        <label className="mb-1.5 block text-xs font-medium">Password</label>
        <input
          className="input mb-4"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        {err && (
          <div className="mb-4 rounded-2xl border border-[#f34646]/30 bg-[#f34646]/10 px-3 py-2 text-xs text-[#c52f2f]">
            {err}
          </div>
        )}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Memproses..." : "Masuk"}
        </button>

        <p className="mt-6 text-center text-xs text-muted">
          Belum punya akun?{" "}
          <Link href="/register" className="font-semibold text-fg underline decoration-[#e6e51e] decoration-4 underline-offset-2">
            Daftar
          </Link>
        </p>
      </form>
      </section>
    </main>
  );
}
