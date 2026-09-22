import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "HF Monitor — Hugging Face 全站熱門儀表盤",
  description: "追蹤 Hugging Face Models / Datasets / Spaces 熱門趨勢",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900 text-sm text-white">▲</span>
              HF Monitor
            </a>
            <nav className="flex items-center gap-5 text-sm text-zinc-500">
              <a className="hover:text-zinc-900" href="/">總覽</a>
              <a className="hover:text-zinc-900" href="https://huggingface.co/models" target="_blank">HF Hub ↗</a>
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-8">
          {children}
          <footer className="muted mt-10 border-t border-zinc-200 pt-4">資料來源: huggingface.co API · 每小時更新</footer>
        </div>
      </body>
    </html>
  );
}
