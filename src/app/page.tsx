import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeProvider";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Soft gradient backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 20% 0%, rgb(124 92 255 / 0.18), transparent 50%), radial-gradient(circle at 80% 100%, rgb(59 130 246 / 0.15), transparent 50%)",
        }}
      />

      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="min-h-screen flex items-center justify-center px-6 py-16">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full
                          border border-border bg-bg-card text-xs text-muted mb-6 shadow-card">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Manual workflow · 100% aman · Tidak ada auto-post
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-5">
            Engage<span className="text-accent">Flow</span>
          </h1>
          <p className="text-lg text-muted mb-8 max-w-xl leading-relaxed">
            Atur, bagi, dan eksekusi komentar pada banyak postingan media sosial
            secara manual — tapi <span className="text-fg">cepat</span>,{" "}
            <span className="text-fg">terstruktur</span>, dan{" "}
            <span className="text-fg">kontekstual</span>. Aplikasi hanya
            membantu mengorganisir; eksekusi tetap di tangan kamu.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className="btn-primary">
              Mulai gratis
            </Link>
            <Link href="/login" className="btn-secondary">
              Sudah punya akun
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-14">
            {[
              [
                "Kategori-aware",
                "Komentar otomatis dipasangkan ke link sesuai kategori.",
              ],
              [
                "Distribusi cerdas",
                "Variasi tone, hindari pengulangan, urutan akun acak.",
              ],
              [
                "Mode eksekusi cepat",
                "1 link per layar, copy + buka link, shortcut keyboard.",
              ],
            ].map(([t, d]) => (
              <div key={t} className="card p-4">
                <div className="text-sm font-semibold mb-1">{t}</div>
                <div className="text-xs text-muted leading-relaxed">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
