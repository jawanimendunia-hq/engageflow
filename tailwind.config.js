/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        bg: {
          DEFAULT: "rgb(var(--bg) / <alpha-value>)",
          elev: "rgb(var(--bg-elev) / <alpha-value>)",
          card: "rgb(var(--bg-card) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          strong: "rgb(var(--border-strong) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          ink: "rgb(var(--accent-ink) / <alpha-value>)",
        },
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--fg-muted) / <alpha-value>)",
      },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.03), 0 4px 14px rgb(0 0 0 / 0.04)",
        elev: "0 4px 16px rgb(0 0 0 / 0.06), 0 12px 36px rgb(0 0 0 / 0.08)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        slideUp: {
          "0%": { opacity: 0, transform: "translateY(8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
