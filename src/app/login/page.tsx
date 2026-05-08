"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={onSubmit} className="card p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">Masuk</h1>
        <p className="text-sm text-muted mb-6">Kelola workflow komentarmu</p>

        <label className="text-xs text-muted mb-1 block">Email</label>
        <input
          className="input mb-3"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="kamu@email.com"
        />

        <label className="text-xs text-muted mb-1 block">Password</label>
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
          <div className="mb-4 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            {err}
          </div>
        )}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Memproses..." : "Masuk"}
        </button>

        <p className="text-xs text-muted mt-6 text-center">
          Belum punya akun?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Daftar
          </Link>
        </p>
      </form>
    </main>
  );
}
