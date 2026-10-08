// GGUF 變體解析：讀 HF tree API 的檔案清單，用檔名正則抓量化標籤＋精確體積。
// PocketPal 同款做法：HF 只當檔案伺服器，量化資訊全靠社群檔名規範。

export interface TreeEntry {
  type: string;
  path: string;
  size?: number;
}

export interface GgufFile {
  name: string; // basename（顯示用）
  full: string; // 倉內完整路徑（resolve 下載連結用）
  quant: string; // Q4_K_M / Q8_0 / F16 ...
  bytes: number;
}

// 量化標籤寫在 .gguf 前面，後面允許跟 -imat 之類後綴：model-Q4_K_M.gguf / model-Q4_K_M-imat.gguf / model-f16.gguf / model-IQ4XS.gguf
const QUANT_RE = /(?:^|[-_.])(Q\d(?:_\w+)?|IQ\d\w*|F16|F32|BF16)(?=[-_.].*\.gguf$|\.gguf$)/i;

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
    const base = e.path.split("/").pop() ?? e.path;
    // mmproj-*.gguf 是視覺投影邊角料（幾百 MB），不是 LLM 權重，會污染排序，直接丟
    if (/^mmproj/i.test(base)) continue;
    const q = parseQuantTag(e.path);
    if (!q) continue;
    out.push({ name: base, full: e.path, quant: q, bytes: e.size });
  }
  return out.sort((a, b) => a.bytes - b.bytes);
}

// 分片 GGUF（model-Q4_K_M-00001-of-00003.gguf）按量化標籤合併：下載體積要加總才對。
// 同倉若有兩個同量化不同模型（8B-Q4_K_M＋70B-Q4_K_M），按檔名主幹分開，不混算。
export interface GgufGroup {
  quant: string;
  bytes: number;
  count: number;
  sample: string; // 顯示用（第一個檔的 basename）
  full: string; // 下載連結用（第一個檔的完整路徑）
}

function groupKey(name: string, quant: string): string {
  const stem = name
    .replace(/\.gguf$/i, "")
    .replace(/-\d+-of-\d+$/i, "") // 分片後綴去掉才是一組
    .replace(new RegExp(`[-_.]${quant}$`, "i"), ""); // 量化標籤去掉，剩模型主幹
  return `${quant}|${stem}`;
}

export function groupGguf(files: GgufFile[]): GgufGroup[] {
  const m = new Map<string, GgufGroup>();
  for (const f of files) {
    const k = groupKey(f.name, f.quant);
    const g = m.get(k) ?? { quant: f.quant, bytes: 0, count: 0, sample: f.name, full: f.full };
    g.bytes += f.bytes;
    g.count += 1;
    m.set(k, g);
  }
  return Array.from(m.values()).sort((a, b) => a.bytes - b.bytes);
}

// 非 GGUF 量化（AWQ/GPTQ/原版）的精確權重體積：*.safetensors（＋舊式 *.bin）加總，tree API 全倉都有 size。
// 訓練副產品（training_args/optimizer/scheduler/rng_state）不是權重，排除。
const JUNK_BIN = /^(training_args|optimizer|scheduler|rng_state|scaler|trainer_state)/i;
export function sumWeightFiles(entries: TreeEntry[]): { bytes: number; count: number } {
  let bytes = 0;
  let count = 0;
  for (const e of entries) {
    if (e.type !== "file" || typeof e.size !== "number") continue;
    const base = e.path.split("/").pop() ?? e.path;
    const low = base.toLowerCase();
    if (!low.endsWith(".safetensors") && !low.endsWith(".bin")) continue;
    if (JUNK_BIN.test(base)) continue;
    bytes += e.size;
    count += 1;
  }
  return { bytes, count };
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

// 直達下載連結（手機點了丟給 PocketPal）。分支寫死 main：GGUF 倉幾乎全是 main，雜支倉會 404（可接受的邊界）。
export function resolveUrl(repo: string, path: string): string {
  const p = path
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `https://huggingface.co/${repo}/resolve/main/${p}`;
}
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
  // 單倉卡住不拖整頁：15 秒超時當失敗跳過
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`https://huggingface.co/api/models/${repoId}/tree/main?recursive=true`, {
      headers: { "User-Agent": "hf-monitor/0.1", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      next: { revalidate: 3600 }, // 檔案樹不常變，緩一小時省配額
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`tree ${r.status}`);
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } finally {
    clearTimeout(timer);
  }
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
