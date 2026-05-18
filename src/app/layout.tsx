import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "EngageFlow",
  description:
    "Workflow manager komentar media sosial: cepat, terstruktur, manual.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

// Script ini dijalankan SEBELUM React hydrate, mencegah flash saat reload di mode dark.
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('theme') || 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = t === 'dark' || (t === 'system' && prefersDark);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-bg text-fg">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
