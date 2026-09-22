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
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-bold">🤗 HF Monitor</h1>
            <nav className="muted flex gap-4">
              <a className="link" href="/">總覽</a>
              <a className="link" href="https://huggingface.co/models" target="_blank">HF Hub ↗</a>
            </nav>
          </header>
          {children}
          <footer className="muted mt-10">資料來源: huggingface.co API · 每小時更新 · MVP</footer>
        </div>
      </body>
    </html>
  );
}
