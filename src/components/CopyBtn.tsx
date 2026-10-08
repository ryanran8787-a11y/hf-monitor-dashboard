"use client";
import { useState } from "react";

// 一鍵複製（clipboard API 失敗時退回 execCommand，http 下也能用）
export default function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // 複製失敗就靜默，下次再按
      }
      ta.remove();
    }
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={text}
      className="rounded-md border border-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-600 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
    >
      {ok ? "Copied" : "Copy"}
    </button>
  );
}
