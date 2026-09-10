import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="marketing-shell">
        <nav className="marketing-nav" aria-label="Navigasi utama">
          <Link href="/" className="brand-lockup" aria-label="EngageFlow — beranda">
            <span className="brand-mark"><Logo size={25} className="text-fg" /></span>
            <span className="brand-name">engageflow</span>
          </Link>

          <div className="marketing-nav-links">
            <a href="#product">Produk</a>
            <a href="#features">Fitur</a>
            <a href="#workflow">Workflow</a>
          </div>

          <div className="marketing-nav-actions">
            <Link href="/login" className="btn-ghost">Masuk</Link>
            <Link href="/register" className="btn-secondary">Mulai gratis</Link>
          </div>
        </nav>

        <section className="marketing-hero" aria-labelledby="hero-title">
          <div className="marketing-kicker">
            <span className="marketing-kicker-dot" />
            Workflow manual yang terasa otomatis
          </div>
          <h1 id="hero-title" className="marketing-title">
            Komentar lebih rapi <span className="headline-sticker headline-sticker-yellow" aria-hidden>✦</span>
            kerja lebih cepat <span className="headline-sticker headline-sticker-blue" aria-hidden>↗</span>
          </h1>
          <p className="marketing-description">
            Atur link, akun, dan stok komentar dalam satu kanvas kerja. EngageFlow
            membagikan tugas dengan cerdas—kamu tetap memegang kendali saat eksekusi.
          </p>
          <div className="marketing-actions">
            <Link href="/register" className="btn-primary">Mulai gratis <span aria-hidden>→</span></Link>
            <Link href="/login" className="btn-secondary">Buka workspace</Link>
          </div>
        </section>

        <section id="product" aria-label="Tampilan produk EngageFlow">
          <ProductPreview />
        </section>

        <section id="features" className="feature-grid" aria-label="Fitur utama">
          {[
            ["01", "Kategori yang paham konteks", "Komentar dipasangkan ke link berdasarkan kategori supaya setiap respons tetap relevan."],
            ["02", "Distribusi akun yang cerdas", "Urutan akun diacak, beban dibagi merata, dan pengulangan yang terasa robotik bisa dihindari."],
            ["03", "Eksekusi fokus, satu per satu", "Satu tugas per layar, copy cepat, buka link, lalu lanjut tanpa kehilangan konteks."],
          ].map(([number, title, description]) => (
            <article key={number} className="feature-card">
              <span className="feature-number">{number}</span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </section>

        <section id="workflow" className="mx-auto mt-24 max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Siap dipakai</p>
          <h2 className="mt-4 text-3xl font-bold md:text-5xl">Dari daftar link ke komentar selesai, tanpa workflow yang berantakan.</h2>
          <div className="marketing-actions">
            <Link href="/register" className="btn-primary">Buat workspace</Link>
            <Link href="/login" className="btn-secondary">Masuk</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProductPreview() {
  return (
    <div className="product-browser">
      <div className="product-browser-bar" aria-hidden>
        <span className="browser-dot bg-[#f34646]" />
        <span className="browser-dot bg-[#e6e51e]" />
        <span className="browser-dot bg-[#466cf3]" />
      </div>
      <div className="product-canvas">
        <span className="annotation-tag">Live workspace</span>
        <span className="peach-wash" aria-hidden />
        <div className="mock-dashboard" aria-hidden>
          <div className="mock-sidebar">
            <div className="mock-brand" />
            <div className="mock-nav-item" />
            <div className="mock-nav-item" />
            <div className="mock-nav-item" />
            <div className="mock-nav-item" />
          </div>
          <div className="mock-content">
            <div className="mock-heading" />
            <div className="mock-subheading" />
            <div className="mock-stat-grid">
              <div className="mock-stat" />
              <div className="mock-stat" />
              <div className="mock-stat" />
            </div>
            <div className="mock-panel-row">
              <div className="mock-panel" />
              <div className="mock-panel" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
