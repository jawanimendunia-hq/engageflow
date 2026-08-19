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
import { ThemeToggle } from "./ThemeProvider";
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
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 self-start flex-col overflow-hidden border-r border-border bg-bg-elev shadow-[8px_0_30px_rgba(15,23,42,0.03)]">
      <div className="p-5 border-b border-border flex items-center justify-center">
        <Link href="/dashboard" aria-label="EngageFlow — ke dashboard">
          <Logo size={56} className="text-fg" />
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-3 space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-bg-card text-fg border border-border shadow-card"
                  : "text-muted hover:text-fg hover:bg-bg-card/60"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div
            className="px-2 py-1 text-xs text-muted truncate min-w-0 flex-1"
            title={email}
          >
            {email}
          </div>
          <ThemeToggle />
        </div>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted hover:text-fg hover:bg-bg-card/60"
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
