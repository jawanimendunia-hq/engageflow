"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function NavigationFeedback() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading) return;
    const fallback = window.setTimeout(() => setLoading(false), 12000);
    return () => window.clearTimeout(fallback);
  }, [loading]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      if (
        nextUrl.origin === window.location.origin &&
        `${nextUrl.pathname}${nextUrl.search}` !==
          `${window.location.pathname}${window.location.search}`
      ) {
        setLoading(true);
      }
    };

    const handleHistory = () => setLoading(true);
    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handleHistory);
    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handleHistory);
    };
  }, []);

  if (!loading) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-live="polite">
      <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-black/10">
        <div className="navigation-progress h-full w-1/3 rounded-full bg-accent" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-bg/35">
        <div className="glass-loading flex items-center gap-3 rounded-full border border-border bg-white px-5 py-3 text-sm font-medium">
          <span className="loading-orbit" /> Memuat halaman...
        </div>
      </div>
    </div>
  );
}
