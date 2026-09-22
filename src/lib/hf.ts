// Hugging Face Hub REST 封裝。MVP 只用公開 API + 可選 HF_TOKEN。
// 文件: https://huggingface.co/docs/hub/api
const API = "https://huggingface.co/api";

function headers() {
  const h: Record<string, string> = { "User-Agent": "hf-monitor-dashboard/0.1" };
  if (process.env.HF_TOKEN) h.Authorization = `Bearer ${process.env.HF_TOKEN}`;
  return h;
}

export type HFKind = "model" | "dataset" | "space";
export interface HFItem {
  id: string;
  author?: string;
  likes: number;
  downloads?: number;
  task?: string;
  tags: string[];
  lastModified?: string;
}

function pickTask(item: any): string | undefined {
  return item?.pipeline_tag ?? item?.task ?? undefined;
}

export async function fetchList(
  kind: HFKind,
  opts: { sort?: "likes" | "downloads" | "lastModified"; limit?: number } = {}
): Promise<HFItem[]> {
  const { sort = "likes", limit = 100 } = opts;
  const path = kind === "model" ? "models" : kind === "dataset" ? "datasets" : "spaces";
  const url = `${API}/${path}?sort=${sort}&direction=-1&limit=${limit}`;
  const res = await fetch(url, { headers: headers(), next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`HF ${path} ${res.status}`);
  const json: any[] = await res.json();
  return json.map((x) => ({
    id: x.id ?? x.name ?? "",
    author: x.author ?? x.id?.split("/")[0],
    likes: x.likes ?? 0,
    downloads: x.downloads ?? 0,
    task: pickTask(x),
    tags: x.tags ?? [],
    lastModified: x.lastModified ?? x.last_modified ?? undefined,
  }));
}

// 預留：Phase 2 Discord / Telegram 通知介面（現在是 no-op，避免 MVP 複雜化）
export interface NotifyEvent {
  type: string;
  text: string;
}
export async function notify(_e: NotifyEvent): Promise<void> {
  // TODO Phase 2: 串 DISCORD_WEBHOOK_URL / TELEGRAM_BOT_TOKEN
  return;
}
