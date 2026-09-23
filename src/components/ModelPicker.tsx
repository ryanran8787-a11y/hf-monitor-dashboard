"use client";
import { useMemo, useState } from "react";

export interface Candidate {
  hfId: string;
  likes: number;
  points: number; // 歷史資料筆數（越多線越長）
  updatedAt: string; // ISO
}

// 共用元件：搜尋有歷史資料的模型。
// PK 頁先用，之後 watchlist 直接 import（props 不變即插即用）。
export default function ModelPicker({
  label,
  color,
  candidates,
  value,
  onChange,
}: {
  label: string;
  color: string;
  candidates: Candidate[];
  value: string;
  onChange: (hfId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const f = s ? candidates.filter((c) => c.hfId.toLowerCase().includes(s)) : candidates;
    return f.slice(0, 30);
  }, [q, candidates]);

  return (
    <div className="relative">
      <div className="muted mb-1 flex items-center gap-1.5 text-xs">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <input
        value={open ? q : value}
        placeholder="輸入關鍵字搜尋…"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {list.length === 0 && <div className="muted px-3 py-2 text-sm">沒有符合的（只有進過 Top20 的才有歷史資料）</div>}
          {list.map((c) => (
            <button
              key={c.hfId}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c.hfId);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <span className="truncate font-mono text-[13px]">{c.hfId}</span>
              <span className="muted shrink-0 text-xs tabular-nums">
                ♥{c.likes.toLocaleString()} · {c.points}筆
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
