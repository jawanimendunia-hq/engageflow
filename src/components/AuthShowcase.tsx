export function AuthShowcase() {
  return (
    <section className="auth-showcase" aria-label="Tentang EngageFlow">
      <div>
        <p className="mb-6 text-sm font-semibold uppercase tracking-[0.16em]">
          EngageFlow workspace
        </p>
        <h1>
          Dari link <span className="headline-sticker headline-sticker-blue" aria-hidden>↗</span>
          ke komentar selesai <span className="headline-sticker bg-white" aria-hidden>✓</span>
        </h1>
      </div>

      <div className="auth-mini-window" aria-hidden>
        <div className="mb-5 flex gap-1.5">
          <span className="browser-dot bg-[#f34646]" />
          <span className="browser-dot bg-[#e6e51e]" />
          <span className="browser-dot bg-[#466cf3]" />
        </div>
        <div className="auth-flow">
          <div className="auth-flow-card" />
          <div className="auth-flow-card" />
          <div className="auth-flow-card" />
        </div>
      </div>
    </section>
  );
}
