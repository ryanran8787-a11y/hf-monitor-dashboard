"use client";
import { useEffect } from "react";

// 全站錯誤邊界：DB 連線失敗、HF API 超時等都會落到這裡，給重試按鈕而不是白屏
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("route error:", error);
  }, [error]);
  return (
    <main className="grid gap-4">
      <div className="card border-l-4 border-l-rose-500">
        <h2 className="section-title mb-1">頁面載入失敗</h2>
        <p className="muted mb-3 text-sm">
          可能是資料庫連線問題或上游 API 超時，等一下再試通常就好了。
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => reset()} className="pill-active">
            重試
          </button>
          <a href="/" className="pill">
            回總覽
          </a>
        </div>
      </div>
    </main>
  );
}
