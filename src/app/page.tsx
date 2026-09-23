import { db } from "@/lib/db";
import { fetchList } from "@/lib/hf";
import TrendChart from "@/components/TrendChart";

export const revalidate = 600;

const SORTS = [
  { key: "trendingScore", label: "熱門" },
  { key: "likes", label: "Likes" },
  { key: "downloads", label: "下載" },
  { key: "lastModified", label: "新動態" },
] as const;

async function getLatest(kind: string, sort: string) {
  // 先讀 DB 快照（按 kind + sortBy 精確過濾），沒有就即時打 HF API
  const rows = await db.snapshot
    .findMany({
      where: { kind, sortBy: sort },
      orderBy: [{ createdAt: "desc" }, { rank: "asc" }],
      take: 50,
    })
    .catch(() => []);
  if (rows.length > 0) return { rows, live: false };
  const items = await fetchList(kind as any, { sort: sort as any, limit: 50 }).catch(() => []);
  return {
    rows: items.map((x, i) => ({ ...x, hfId: x.id, rank: i + 1, createdAt: new Date() })),
    live: true,
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams: { kind?: string; sort?: string };
}) {
  const kind = (["model", "dataset", "space"] as const).includes(searchParams.kind as any)
    ? searchParams.kind!
    : "model";
  const sort = SORTS.some((s) => s.key === searchParams.sort) ? searchParams.sort! : "trendingScore";
  const sortLabel = SORTS.find((s) => s.key === sort)!.label;
  const { rows, live } = await getLatest(kind, sort);
  const metricKey = sort === "downloads" ? "downloads" : "likes";

  return (
    <main className="grid gap-4">
      <div className="card flex flex-wrap items-center gap-2 !p-3">
        {(["model", "dataset", "space"] as const).map((k) => (
          <a key={k} href={`/?kind=${k}&sort=${sort}`} className={kind === k ? "pill-active" : "pill"}>
            {k}s
          </a>
        ))}
        <span className="mx-1 h-5 w-px bg-zinc-200" />
        {SORTS.map((s) => (
          <a key={s.key} href={`/?kind=${kind}&sort=${s.key}`} className={sort === s.key ? "pill-active" : "pill"}>
            {s.label}
          </a>
        ))}
        <span className="muted ml-auto flex items-center gap-1.5 text-xs">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-amber-500" : "bg-emerald-500"}`} />
          {live ? "即時 HF API" : "DB 快照"} · {kind} / {sort}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="muted">追蹤項目</div>
          <div className="stat-num mt-1">{rows.length}</div>
        </div>
        <div className="card">
          <div className="muted">Top 1 · {sortLabel}</div>
          <div className="mt-1 truncate font-mono text-[15px]" title={(rows[0] as any)?.hfId ?? ""}>
            {(rows[0] as any)?.hfId ?? "-"}
          </div>
        </div>
        <div className="card">
          <div className="muted">更新時間（台北）</div>
          <div className="mt-1 text-[15px] tabular-nums">
            {(rows[0] as any)?.createdAt ? new Date((rows[0] as any).createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) : "-"}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title mb-3">{sortLabel} Top 10</h2>
        <TrendChart
          data={rows.slice(0, 10).map((r: any) => ({ name: r.hfId, value: r[metricKey] ?? 0 }))}
        />
      </div>

      <div className="card overflow-x-auto !p-0">
        <h2 className="section-title px-5 pb-1 pt-5">{sortLabel} {kind}s Top 50</h2>
        <table className="data">
          <thead>
            <tr><th className="w-10">#</th><th>ID</th><th className="text-right">Likes</th><th className="text-right">Downloads</th><th>Task</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={`${r.hfId}-${i}`}>
                <td className="tabular-nums text-zinc-400">{r.rank ?? i + 1}</td>
                <td className="font-mono text-[13px]">
                  <a className="link" href={`/model/${r.hfId}?kind=${kind}`}>
                    {r.hfId}
                  </a>
                </td>
                <td className="text-right tabular-nums">{r.likes?.toLocaleString?.() ?? r.likes}</td>
                <td className="text-right tabular-nums">{r.downloads?.toLocaleString?.() ?? r.downloads ?? "-"}</td>
                <td><span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{r.task ?? "-"}</span></td>
                <td className="muted whitespace-nowrap tabular-nums">{r.lastModified?.slice(0, 10) ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted px-5 pb-5">尚無資料，先跑 `npm run collect` 或等 GitHub Actions 收集。</p>}
      </div>
    </main>
  );
}
