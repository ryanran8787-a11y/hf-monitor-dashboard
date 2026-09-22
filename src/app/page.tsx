import { db } from "@/lib/db";
import { fetchList } from "@/lib/hf";
import TrendChart from "@/components/TrendChart";

export const revalidate = 600;

const SORTS = [
  { key: "trendingScore", label: "🔥 熱門" },
  { key: "likes", label: "👍 Likes" },
  { key: "downloads", label: "⬇ 下載" },
  { key: "lastModified", label: "🆕 新動態" },
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
  const kind = searchParams.kind ?? "model";
  const sort = SORTS.some((s) => s.key === searchParams.sort) ? searchParams.sort! : "trendingScore";
  const sortLabel = SORTS.find((s) => s.key === sort)!.label;
  const { rows, live } = await getLatest(kind, sort);
  const metricKey = sort === "downloads" ? "downloads" : "likes";

  return (
    <main className="grid gap-4">
      <div className="card flex flex-wrap items-center gap-2">
        {(["model", "dataset", "space"] as const).map((k) => (
          <a
            key={k}
            href={`/?kind=${k}&sort=${sort}`}
            className={`rounded-full px-4 py-1 text-sm border ${
              kind === k ? "bg-sky-500 text-white border-sky-500" : "border-zinc-700"
            }`}
          >
            {k}s
          </a>
        ))}
        <span className="mx-1 text-zinc-700">|</span>
        {SORTS.map((s) => (
          <a
            key={s.key}
            href={`/?kind=${kind}&sort=${s.key}`}
            className={`rounded-full px-4 py-1 text-sm border ${
              sort === s.key ? "bg-amber-500 text-white border-amber-500" : "border-zinc-700"
            }`}
          >
            {s.label}
          </a>
        ))}
        <span className="muted ml-auto">{live ? "● 即時 HF API" : "● DB 快照"} · {kind}/{sort}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="muted">追蹤項目</div>
          <div className="text-3xl font-bold">{rows.length}</div>
        </div>
        <div className="card">
          <div className="muted">Top 1 · {sortLabel}</div>
          <div className="truncate font-mono text-lg" title={(rows[0] as any)?.hfId ?? ""}>
            {(rows[0] as any)?.hfId ?? "-"}
          </div>
        </div>
        <div className="card">
          <div className="muted">更新時間</div>
          <div className="text-lg">
            {(rows[0] as any)?.createdAt ? new Date((rows[0] as any).createdAt).toLocaleString("zh-TW", { hour12: false }) : "-"}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">{sortLabel} Top 10</h2>
        <TrendChart
          data={rows.slice(0, 10).map((r: any) => ({ name: r.hfId, value: r[metricKey] ?? 0 }))}
        />
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">{sortLabel} {kind}s Top 50</h2>
        <table className="data">
          <thead>
            <tr><th>#</th><th>ID</th><th>Likes</th><th>Downloads</th><th>Task</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={`${r.hfId}-${i}`}>
                <td>{r.rank ?? i + 1}</td>
                <td className="font-mono">
                  <a className="link" href={`/model/${r.hfId}?kind=${kind}`}>
                    {r.hfId}
                  </a>
                </td>
                <td>{r.likes?.toLocaleString?.() ?? r.likes}</td>
                <td>{r.downloads?.toLocaleString?.() ?? r.downloads ?? "-"}</td>
                <td>{r.task ?? "-"}</td>
                <td className="muted">{r.lastModified?.slice(0, 10) ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted mt-2">尚無資料，先跑 `npm run collect` 或等 GitHub Actions 收集。</p>}
      </div>
    </main>
  );
}
