"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// 追蹤開關（詳情頁＋清單共用）：☆追蹤 / ★追蹤中，點一下切換。
export default function WatchToggle({ kind, hfId, initial }: { kind: string; hfId: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      if (on) {
        await fetch(`/api/watch?kind=${kind}&hfId=${encodeURIComponent(hfId)}`, { method: "DELETE" });
        setOn(false);
      } else {
        const r = await fetch("/api/watch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, hfId }),
        });
        if (r.ok) setOn(true);
      }
      router.refresh();
    } catch {
      // 靜默失敗，下次再按
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={toggle}
      className={on ? "pill-active" : "pill"}
      title={on ? "取消追蹤" : "追蹤此模型（每輪收集養曲線）"}
    >
      {on ? "★ 追蹤中" : "☆ 追蹤"}
    </button>
  );
}
