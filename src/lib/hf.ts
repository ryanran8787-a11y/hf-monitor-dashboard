// Hugging Face Hub REST 封裝。公開 API + 可選 HF_TOKEN。
// 文件: https://huggingface.co/docs/hub/api
// 實測可用排序: likes / downloads / lastModified / trendingScore / createdAt
// 注意: 列表 API 不回 lastModified，只回 createdAt。
const API = "https://huggingface.co/api";

function headers() {
  const h: Record<string, string> = { "User-Agent": "hf-monitor-dashboard/0.1" };
  if (process.env.HF_TOKEN) h.Authorization = `Bearer ${process.env.HF_TOKEN}`;
  return h;
}

export type HFKind = "model" | "dataset" | "space";
export type HFSort = "likes" | "downloads" | "lastModified" | "trendingScore";
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

export function mapItem(x: any): HFItem {
  return {
    id: x.id ?? x.name ?? "",
    author: x.author ?? x.id?.split("/")[0],
    likes: x.likes ?? 0,
    downloads: x.downloads ?? 0,
    task: pickTask(x),
    tags: x.tags ?? [],
    // 列表 API 只有 createdAt，詳情 API 才有 lastModified，兩者都收
    lastModified: x.lastModified ?? x.last_modified ?? x.createdAt ?? undefined,
  };
}

export async function fetchList(
  kind: HFKind,
  opts: { sort?: HFSort; limit?: number } = {}
): Promise<HFItem[]> {
  const { sort = "likes", limit = 100 } = opts;
  const path = kind === "model" ? "models" : kind === "dataset" ? "datasets" : "spaces";
  const url = `${API}/${path}?sort=${sort}&direction=-1&limit=${limit}`;
  const res = await fetch(url, { headers: headers(), next: { revalidate: 600 } });
  if (!res.ok) throw new Error(`HF ${path} ${res.status}`);
  const json: any[] = await res.json();
  return json.map(mapItem);
}

// 單一 repo 詳情（含 lastModified、siblings 等列表 API 沒有的欄位）
const HFID = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?$/; // 跟 /api/watch 同一白名單
export async function fetchOne(kind: HFKind, hfId: string): Promise<any | null> {
  if (!HFID.test(hfId)) return null;
  const path = kind === "model" ? "models" : kind === "dataset" ? "datasets" : "spaces";
  const seg = hfId
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const res = await fetch(`${API}/${path}/${seg}`, { headers: headers(), next: { revalidate: 600 } });
  if (!res.ok) return null;
  return res.json();
}

