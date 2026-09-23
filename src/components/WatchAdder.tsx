"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  hfId: string;
  likes: number;
}

// watch 加入框：即時搜 HF（冷門模型也加得進來）→ POST /api/watch。
export default function WatchAdder() {
  const router = useRouter();
  const [kind, setKind] = useState("model");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/hf-search?kind=${kind}&q=${encodeURIComponent(s)}`);
        const j = await r.json();
        setHits(j.items ?? []);
      } catch {
        setHits([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, kind]);

  async function add(hfId: string) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, hfId }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.error ?? "加入失敗");
      } else {
        setMsg(j.existed ? "已經在追蹤了" : `已追蹤 ${hfId}，下輪收集開始養曲線`);
        setQ("");
        setHits([]);
        router.refresh();
      }
    } catch {
      setMsg("加入失敗");
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="mb-2 flex gap-2">
        {(["model", "dataset", "space"] as const).map((k) => (
          <button key={k} type="button" onClick={() => { setKind(k); setHits([]); }} className={kind === k ? "pill-active" : "pill"}>
            {k}s
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="輸入名稱搜尋 HF（至少 2 字）…"
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-400"
      />
      {hits.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {hits.map((h) => (
            <div key={h.hfId} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-zinc-50">
              <span className="truncate font-mono text-[13px]">{h.hfId}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="muted text-xs tabular-nums">♥{h.likes.toLocaleString()}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => add(h.hfId)}
                  className="rounded-md bg-zinc-900 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                >
                  追蹤
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {msg && <p className="muted mt-1 text-xs">{msg}</p>}
    </div>
  );
}
