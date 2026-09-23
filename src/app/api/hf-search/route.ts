import { NextResponse } from "next/server";

// 即時搜尋 HF（給 watch 加冷門模型用，不走 DB）。q 至少 2 字，debounce 由前端做。
const API = "https://huggingface.co/api";

function headers() {
  const h: Record<string, string> = { "User-Agent": "hf-monitor-dashboard/0.1" };
  if (process.env.HF_TOKEN) h.Authorization = `Bearer ${process.env.HF_TOKEN}`;
  return h;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind") ?? "model";
  const q = (u.searchParams.get("q") ?? "").trim();
  if (!["model", "dataset", "space"].includes(kind)) {
    return NextResponse.json({ error: "kind 錯誤" }, { status: 400 });
  }
  if (q.length < 2) return NextResponse.json({ items: [] });
  const path = kind === "model" ? "models" : kind === "dataset" ? "datasets" : "spaces";
  try {
    const res = await fetch(`${API}/${path}?search=${encodeURIComponent(q)}&limit=20&sort=likes&direction=-1`, {
      headers: headers(),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: `HF ${res.status}` }, { status: 502 });
    const json: any[] = await res.json();
    const items = json
      .map((x) => ({ hfId: x.id ?? x.name ?? "", likes: x.likes ?? 0 }))
      .filter((i) => i.hfId);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "搜尋失敗" }, { status: 502 });
  }
}
