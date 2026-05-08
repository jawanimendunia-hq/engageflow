"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const ThemeCtx = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "light" | "dark";
}>({
  theme: "system",
  setTheme: () => {},
  resolved: "dark",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  // Hydrate dari localStorage
  useEffect(() => {
    const saved = (localStorage.getItem("theme") as Theme | null) ?? "system";
    setThemeState(saved);
  }, []);

  // Apply theme ke <html>
  useEffect(() => {
    const root = document.documentElement;
    const apply = (t: "light" | "dark") => {
      root.classList.toggle("dark", t === "dark");
      setResolved(t);
    };
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches ? "dark" : "light");
      const handler = (e: MediaQueryListEvent) =>
        apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      apply(theme);
    }
  }, [theme]);

  function setTheme(t: Theme) {
    localStorage.setItem("theme", t);
    setThemeState(t);
  }

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}

/**
 * Tombol toggle 3-state: light / dark / system
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  const items: { id: Theme; icon: typeof Sun; label: string }[] = [
    { id: "light", icon: Sun, label: "Light" },
    { id: "dark", icon: Moon, label: "Dark" },
    { id: "system", icon: Monitor, label: "System" },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-bg-elev",
        className
      )}
    >
      {items.map(({ id, icon: Icon, label }) => {
        const active = theme === id;
        return (
          <button
            key={id}
            onClick={() => setTheme(id)}
            title={label}
            className={cn(
              "size-7 inline-flex items-center justify-center rounded-md transition-colors",
              active
                ? "bg-bg-card shadow-sm text-fg"
                : "text-muted hover:text-fg"
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
