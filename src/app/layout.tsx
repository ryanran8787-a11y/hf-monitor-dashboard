import "./globals.css";
import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "HF Monitor — Hugging Face 全站熱門儀表盤",
  description: "追蹤 Hugging Face Models / Datasets / Spaces 熱門趨勢",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        {/* 主題初始化：paint 之前先寫好 html.dark，避免閃白 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('hf-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        <ThemeProvider>
        <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900 dark:border dark:border-zinc-700">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <rect x="2" y="7" width="2.5" height="5" rx="0.8" fill="white" opacity="0.65" />
                  <rect x="5.75" y="4" width="2.5" height="8" rx="0.8" fill="white" opacity="0.85" />
                  <rect x="9.5" y="2" width="2.5" height="10" rx="0.8" fill="white" />
                </svg>
              </span>
              HF Monitor
            </a>
            <nav className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
              <a className="hover:text-zinc-900 dark:hover:text-white" href="/">總覽</a>
              <a className="hover:text-zinc-900 dark:hover:text-white" href="/compare">雙雄PK</a>
              <a className="hover:text-zinc-900 dark:hover:text-white" href="/watch">追蹤</a>
              <a className="hover:text-zinc-900 dark:hover:text-white" href="https://huggingface.co/models" target="_blank">HF Hub ↗</a>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-8">
          {children}
          <footer className="muted mt-10 border-t border-zinc-200 pt-4 dark:border-zinc-800">資料來源: huggingface.co API · 每小時更新</footer>
        </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
