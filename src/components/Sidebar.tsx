"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  MessageSquare,
  LogOut,
  Settings,
  LoaderCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { useState } from "react";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaign", icon: Megaphone },
  { href: "/accounts", label: "Akun", icon: Users },
  { href: "/comments", label: "Komentar", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="app-sidebar flex shrink-0 self-start flex-col overflow-hidden">
      <div className="app-sidebar-header flex items-center border-b border-border p-5">
        <Link href="/dashboard" aria-label="EngageFlow — ke dashboard">
          <span className="brand-lockup">
            <span className="brand-mark">
              <Logo size={25} className="text-fg" />
            </span>
            <span className="brand-name">engageflow</span>
          </span>
        </Link>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "sidebar-link flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors",
                active
                  ? "sidebar-link-active"
                  : "text-muted hover:text-fg"
              )}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="app-sidebar-footer space-y-2 border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-2xl bg-bg-elev px-3 py-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#466cf3] text-xs font-bold text-white">
            {email.charAt(0).toUpperCase() || "E"}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted">Workspace</div>
            <div className="truncate text-xs font-medium" title={email}>{email}</div>
          </div>
        </div>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="sidebar-link flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted transition-colors hover:text-fg"
        >
          {loggingOut ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          {loggingOut ? "Keluar..." : "Keluar"}
        </button>
      </div>
    </aside>
  );
}
