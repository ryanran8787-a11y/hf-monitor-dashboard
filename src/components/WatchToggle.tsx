"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// 追蹤開關（詳情頁＋清單共用）：☆追蹤 / ★追蹤中，點一下切換。
export default function WatchToggle({ kind, hfId, initial }: { kind: string; hfId: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    setBusy(true);
    setFailed(false);
    try {
      if (on) {
        const r = await fetch(`/api/watch?kind=${kind}&hfId=${encodeURIComponent(hfId)}`, { method: "DELETE" });
        if (r.ok) setOn(false);
        else setFailed(true);
      } else {
        const r = await fetch("/api/watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, hfId }),
        });
        if (r.ok) setOn(true);
        else setFailed(true); // 50 上限 / DB 錯誤不再靜默
      }
      router.refresh();
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className={on ? "pill-active" : "pill"}
        title={on ? "Unwatch" : "Watch this repo (refreshed every round)"}
      >
        {on ? "★ Watching" : "☆ Watch"}
      </button>
      {failed && <span className="text-xs text-rose-600 dark:text-rose-400">Failed. Try again.</span>}
    </span>
  );
}
