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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeProvider";
import { Logo } from "./Logo";

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

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-bg-elev flex flex-col">
      <div className="p-5 border-b border-border flex items-center justify-center">
        <Link href="/dashboard" aria-label="EngageFlow — ke dashboard">
          <Logo size={56} className="text-fg" />
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1">
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
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted hover:text-fg hover:bg-bg-card/60"
        >
          <LogOut className="size-4" /> Keluar
        </button>
      </div>
    </aside>
  );
}
