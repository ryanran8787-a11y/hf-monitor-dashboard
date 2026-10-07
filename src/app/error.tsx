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
        <h2 className="section-title mb-1">Failed to load</h2>
        <p className="muted mb-3 text-sm">
          Likely a database connection issue or upstream API timeout. Usually fine on retry.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => reset()} className="pill-active">
            Retry
          </button>
          <a href="/" className="pill">
            Back to overview
          </a>
        </div>
      </div>
    </main>
  );
}
