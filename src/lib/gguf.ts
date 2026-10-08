// GGUF 變體解析：讀 HF tree API 的檔案清單，用檔名正則抓量化標籤＋精確體積。
// PocketPal 同款做法：HF 只當檔案伺服器，量化資訊全靠社群檔名規範。

export interface TreeEntry {
  type: string;
  path: string;
  size?: number;
}

export interface GgufFile {
  name: string; // basename
  quant: string; // Q4_K_M / Q8_0 / F16 ...
  bytes: number;
}

// 量化標籤寫在 .gguf 前面，後面允許跟 -imat 之類後綴：model-Q4_K_M.gguf / model-Q4_K_M-imat.gguf / model-f16.gguf
const QUANT_RE = /(?:^|[-_.])(Q\d(?:_\w+)?|IQ\d_\w+|F16|F32|BF16)(?=[-_.].*\.gguf$|\.gguf$)/i;

export function parseQuantTag(filename: string): string | null {
  const base = filename.split("/").pop() ?? filename;
  if (!base.toLowerCase().endsWith(".gguf")) return null;
  const m = base.match(QUANT_RE);
  return m ? m[1].toUpperCase() : null;
}

export function findGgufFiles(entries: TreeEntry[]): GgufFile[] {
  const out: GgufFile[] = [];
  for (const e of entries) {
    if (e.type !== "file" || typeof e.size !== "number") continue;
    const q = parseQuantTag(e.path);
    if (!q) continue;
    out.push({ name: e.path.split("/").pop() ?? e.path, quant: q, bytes: e.size });
  }
  return out.sort((a, b) => a.bytes - b.bytes);
}

// GB 口徑跟 PocketPal 一致：bytes / 1024^3，小檔顯示 MB
export function fmtSize(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

// 權重體積換算常駐記憶體：×1.2（mmap＋推理開銷），KV cache 看上下文另加
export function ramGb(bytes: number): number {
  return (bytes / 1024 ** 3) * 1.2;
}

// 無精確檔案時的退路：每參數 byte 數（fp16=2，Q4 約 0.55）
const BPP: Record<string, number> = {
  F32: 4, F16: 2, BF16: 2, Q8_0: 1.05, Q6_K: 0.82, Q5_K_M: 0.68, Q5_0: 0.65,
  Q4_K_M: 0.59, Q4_0: 0.55, Q3_K_M: 0.45, Q2_K: 0.35,
};

export function estimateBytes(params: number, quant: string): number | null {
  const bpp = BPP[quant.toUpperCase()];
  return bpp == null ? null : params * bpp;
}

// ---- 變體搜尋：repo 名後綴判斷家族與類型（啟發式，僅供參考）----
const QUANT_SUFFIX = /-(GGUF|AWQ|GPTQ|EXL2|HQQ|BNB|MLX|GGML|FP16|FP8|INT8|INT4)$/i;
const UNCENSORED_RE = /(uncensor|abliterat|unfilter|jailbreak|nsfw|lewd)/i;

export function stripQuantSuffix(name: string): string {
  return name.replace(QUANT_SUFFIX, "");
}

export type VariantKind = "gguf" | "awq" | "gptq" | "other-quant" | "original" | "uncensored";

export function classifyRepo(hfId: string, tags: string[] = []): { kind: VariantKind; uncensored: boolean } {
  const n = hfId.toLowerCase();
  const t = tags.map((x) => x.toLowerCase());
  const uncensored = UNCENSORED_RE.test(n) || t.some((x) => UNCENSORED_RE.test(x));
  let kind: VariantKind = "original";
  if (/-gguf$/i.test(n) || n.includes("gguf") || t.includes("gguf")) kind = "gguf";
  else if (/-awq$/i.test(n) || t.includes("awq")) kind = "awq";
  else if (/-gptq$/i.test(n) || t.includes("gptq")) kind = "gptq";
  else if (/(exl2|hqq|bnb|mlx|quantiz)/i.test(n) || t.some((x) => /quantiz|4bit|8bit/i.test(x))) kind = "other-quant";
  return { kind, uncensored };
}

// ---- HF API ----
export async function fetchRepoTree(repoId: string, token = ""): Promise<TreeEntry[]> {
  const r = await fetch(`https://huggingface.co/api/models/${repoId}/tree/main?recursive=true`, {
    headers: { "User-Agent": "hf-monitor/0.1", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    next: { revalidate: 3600 }, // 檔案樹不常變，緩一小時省配額
  });
  if (!r.ok) throw new Error(`tree ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

export async function searchRepos(query: string, limit: number, token = ""): Promise<any[]> {
  const r = await fetch(
    `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&sort=downloads&direction=-1&limit=${limit}`,
    {
      headers: { "User-Agent": "hf-monitor/0.1", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      next: { revalidate: 3600 },
    }
  );
  if (!r.ok) throw new Error(`search ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}
