import { fetchOne } from "@/lib/hf";
import CopyBtn from "@/components/CopyBtn";
import {
  searchRepos,
  fetchRepoTree,
  findGgufFiles,
  groupGguf,
  sumWeightFiles,
  classifyRepo,
  fmtSize,
  ramGb,
  estimateBytes,
  resolveUrl,
} from "@/lib/gguf";

export const revalidate = 600;

const HF_TOKEN = process.env.HF_TOKEN ?? "";
const TREE_CAP = 6; // 每查詢最多打幾棵檔案樹（model_info＋tree 兩次請求，省配額）
const DEVICES = [
  { label: "8GB phone", gb: 8 },
  { label: "16GB laptop", gb: 16 },
  { label: "32GB desktop", gb: 32 },
];

function parseParamsFromName(hfId: string): number | null {
  const m = hfId.match(/(\d+(?:\.\d+)?)\s*B\b/i);
  if (!m) return null;
  const b = Number(m[1]);
  return b > 0 && b < 1000 ? b * 1e9 : null;
}

interface Cand {
  hfId: string;
  likes: number;
  downloads: number;
  tags: string[];
  params: number | null;
}

interface VariantRow {
  repo: string;
  uncensored: boolean;
  file: string;
  path: string;
  parts: number;
  quant: string;
  bytes: number;
}

interface WeightRow {
  repo: string;
  uncensored: boolean;
  label: string;
  bytes: number;
}

const KIND_LABEL: Record<string, string> = {
  awq: "AWQ",
  gptq: "GPTQ",
  "other-quant": "quant",
  original: "weights",
};

// 三燈號：est RAM 能否塞進手機／筆電／桌機（估算，僅供參考）
function Lamps({ ram }: { ram: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`Needs ~${ram.toFixed(1)} GB RAM (estimate)`}>
      {DEVICES.map((d) => (
        <span
          key={d.label}
          title={`${d.label}: ${ram <= d.gb ? "fits" : "too big"}`}
          className={`inline-block h-2 w-2 rounded-full ${ram <= d.gb ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
        />
      ))}
    </span>
  );
}

// /run?q=Qwen3-8B：找可跑版本（GGUF 變體＋精確體積＋RAM 估算）。唯讀，不寫庫。
export default async function RunPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? "").trim();

  let loadError = "";
  let cands: Cand[] = [];
  let rows: VariantRow[] = [];
  let weights: WeightRow[] = [];
  let estRows: { quant: string; bytes: number }[] = [];
  let paramsNote: number | null = null;

  if (q) {
    try {
      const raw = await searchRepos(q, 12, HF_TOKEN).catch(() => []);
      const seen = new Set<string>();
      const push = (x: any) => {
        const hfId = x?.id ?? x?.hfId;
        if (!hfId || seen.has(hfId)) return;
        seen.add(hfId);
        const tags = (x?.tags ?? []) as string[];
        cands.push({
          hfId,
          likes: x?.likes ?? 0,
          downloads: x?.downloads ?? 0,
          tags,
          params: (x?.safetensors?.total as number) ?? parseParamsFromName(hfId),
        });
      };
      // 完整 repo id（org/name）直接把本尊放第一位
      if (q.includes("/")) {
        const live = await fetchOne("model", q).catch(() => null);
        if (live) push({ id: q, likes: live.likes, downloads: live.downloads, tags: live.tags ?? [] });
      }
      for (const x of raw) push(x);

      // tree 打兩類：GGUF 優先，其餘候選補位（同樣 cap 上限）；逐個失敗互不影響
      const ggufs = cands.filter((c) => classifyRepo(c.hfId, c.tags).kind === "gguf");
      const others = cands.filter((c) => classifyRepo(c.hfId, c.tags).kind !== "gguf");
      const targets = ggufs.concat(others).slice(0, TREE_CAP);
      await Promise.all(
        targets.map(async (c) => {
          try {
            const tree = await fetchRepoTree(c.hfId, HF_TOKEN);
            const cls = classifyRepo(c.hfId, c.tags);
            const groups = groupGguf(findGgufFiles(tree));
            for (const g of groups) {
              rows.push({
                repo: c.hfId,
                uncensored: cls.uncensored,
                file: g.count > 1 ? `${g.sample} +${g.count - 1} more` : g.sample,
                path: g.full,
                parts: g.count,
                quant: g.quant,
                bytes: g.bytes,
              });
            }
            // 非 GGUF 倉：safetensors 加總就是精確權重體積
            if (groups.length === 0 && cls.kind !== "gguf") {
              const w = sumWeightFiles(tree);
              if (w.bytes > 0) {
                weights.push({ repo: c.hfId, uncensored: cls.uncensored, label: KIND_LABEL[cls.kind] ?? "weights", bytes: w.bytes });
              }
            }
          } catch {
            // 401（需授權）或 404 直接跳過該倉
          }
        })
      );
      rows.sort((a, b) => a.bytes - b.bytes);
      weights.sort((a, b) => a.bytes - b.bytes);

      // 參數總量：本尊優先，否則第一個有名堂的候選；缺失的檔位用估算補上（標 ~）
      paramsNote = cands.find((c) => c.params != null)?.params ?? null;
      if (paramsNote != null) {
        const have = new Set(rows.map((r) => r.quant.toUpperCase()));
        for (const quant of ["F16", "Q8_0", "Q4_K_M"]) {
          if (have.has(quant)) continue;
          const b = estimateBytes(paramsNote, quant);
          if (b != null) estRows.push({ quant, bytes: b });
        }
      }
    } catch {
      loadError = "Search failed (HF API or network issue). Try again in a bit.";
    }
  }

  return (
    <main className="grid gap-4">
      <div className="card">
        <h2 className="section-title mb-1">Find a runnable variant</h2>
        <p className="muted mb-3 text-xs">
          Models only. Filename-based detection (best-effort): exact sizes come from the repo file tree, RAM is
          weights × 1.2 (KV cache extra).
        </p>
        <form method="get" action="/run" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Model name or org/name, e.g. Qwen3-8B"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button type="submit" className="pill-active shrink-0">
            Search
          </button>
        </form>
      </div>

      {q && loadError && <div className="card border-l-4 border-l-rose-500 text-sm">{loadError}</div>}

      {q && !loadError && (
        <>
          <div className="card overflow-x-auto !p-0">
            <h2 className="section-title px-5 pb-1 pt-5">GGUF variants ({rows.length})</h2>
            <table className="data min-w-[720px]">
              <thead>
                <tr>
                  <th>Repo</th>
                  <th>File</th>
                  <th>Quant</th>
                  <th className="text-right">Size</th>
                  <th className="text-right">Est. RAM</th>
                  <th>Fits phone / laptop / desktop</th>
                  <th>Cmd</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const ram = ramGb(r.bytes);
                  return (
                    <tr key={`${r.repo}/${r.file}`}>
                      <td className="font-mono text-[13px]">
                        <a className="link" href={`/model/${r.repo}?kind=model`}>
                          {r.repo}
                        </a>{" "}
                        {r.uncensored && (
                          <span
                            title="Name/tag match, unverified"
                            className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          >
                            uncensored?
                          </span>
                        )}
                        <span className="muted ml-1 text-xs tabular-nums">#{i + 1}</span>
                      </td>
                      <td className="font-mono text-[13px]">
                        <a className="link" href={resolveUrl(r.repo, r.path)} target="_blank" title="Direct download from HF">
                          {r.file}
                        </a>
                      </td>
                      <td>
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {r.quant}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{fmtSize(r.bytes)}</td>
                      <td className="text-right tabular-nums">~{ram.toFixed(1)} GB</td>
                      <td>
                        <Lamps ram={ram} />
                      </td>
                      <td>
                        <CopyBtn
                          text={
                            r.parts > 1
                              ? `huggingface-cli download ${r.repo}`
                              : `huggingface-cli download ${r.repo} ${r.path}`
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="muted px-5 pb-5 text-sm">
                No GGUF files found in the top candidates{cands.length > 0 ? ` (${cands.length} repos checked)` : ""}.
                The original weights may be the only option, see estimates below.
              </p>
            )}
          </div>

          {weights.length > 0 && (
            <div className="card overflow-x-auto !p-0">
              <h2 className="section-title px-5 pb-1 pt-5">Exact weights, non-GGUF ({weights.length})</h2>
              <table className="data min-w-[640px]">
                <thead>
                  <tr>
                    <th>Repo</th>
                    <th>Type</th>
                    <th className="text-right">Size</th>
                    <th className="text-right">Est. RAM</th>
                    <th>Fits phone / laptop / desktop</th>
                  </tr>
                </thead>
                <tbody>
                  {weights.map((w) => {
                    const ram = ramGb(w.bytes);
                    return (
                      <tr key={`${w.repo}/${w.label}`}>
                        <td className="font-mono text-[13px]">
                          <a className="link" href={`/model/${w.repo}?kind=model`}>
                            {w.repo}
                          </a>{" "}
                          {w.uncensored && (
                            <span
                              title="Name/tag match, unverified"
                              className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            >
                              uncensored?
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {w.label}
                          </span>
                        </td>
                        <td className="text-right tabular-nums">{fmtSize(w.bytes)}</td>
                        <td className="text-right tabular-nums">~{ram.toFixed(1)} GB</td>
                        <td>
                          <Lamps ram={ram} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted px-5 pb-5 text-xs">Summed *.safetensors (+ old *.bin) from the repo file tree. Exact, not estimated.</p>
            </div>
          )}

          {estRows.length > 0 && (
            <div className="card overflow-x-auto !p-0">
              <h2 className="section-title px-5 pb-1 pt-5">Estimates (no exact file found)</h2>
              <table className="data min-w-[560px]">
                <thead>
                  <tr>
                    <th>Quant</th>
                    <th className="text-right">≈ Size</th>
                    <th className="text-right">Est. RAM</th>
                    <th>Fits phone / laptop / desktop</th>
                  </tr>
                </thead>
                <tbody>
                  {estRows.map((r) => {
                    const ram = ramGb(r.bytes);
                    return (
                      <tr key={r.quant}>
                        <td className="font-mono text-[13px]">~{r.quant}</td>
                        <td className="text-right tabular-nums">~{fmtSize(r.bytes)}</td>
                        <td className="text-right tabular-nums">~{ram.toFixed(1)} GB</td>
                        <td>
                          <Lamps ram={ram} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted px-5 pb-5 text-xs">
                Rough per-parameter math{(paramsNote != null && ` (${(paramsNote / 1e9).toFixed(1)}B params)`) || ""}.
                Real GGUF files (table above) always win over estimates.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
