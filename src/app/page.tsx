import { db } from "@/lib/db";
import { fetchList } from "@/lib/hf";
import TrendChart from "@/components/TrendChart";

export const revalidate = 600;

async function getLatest(kind: string) {
  // 先讀 DB 快照，沒有就即時打 HF API（首屏不空白）
  const rows = await db.snapshot
    .findMany({ where: { kind }, orderBy: [{ createdAt: "desc" }, { rank: "asc" }], take: 50 })
    .catch(() => []);
  if (rows.length > 0) return { rows, live: false };
  const items = await fetchList(kind as any, { limit: 50 }).catch(() => []);
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
  const { rows, live } = await getLatest(kind);
  const history = await db.metricHistory
    .findMany({ orderBy: { createdAt: "asc" }, take: 500 })
    .catch(() => []);

  return (
    <main className="grid gap-4">
      <div className="card flex flex-wrap items-center gap-3">
        {(["model", "dataset", "space"] as const).map((k) => (
          <a
            key={k}
            href={`/?kind=${k}`}
            className={`rounded-full px-4 py-1 text-sm border ${
              kind === k ? "bg-sky-500 text-white border-sky-500" : "border-zinc-700"
            }`}
          >
            {k}s
          </a>
        ))}
        <span className="muted ml-auto">{live ? "● 即時 HF API" : "● DB 快照"} · kind={kind}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="muted">追蹤項目</div>
          <div className="text-3xl font-bold">{rows.length}</div>
        </div>
        <div className="card">
          <div className="muted">Top 1</div>
          <div className="truncate font-mono text-lg">{(rows[0] as any)?.hfId ?? "-"}</div>
        </div>
        <div className="card">
          <div className="muted">歷史點數</div>
          <div className="text-3xl font-bold">{history.length}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">Likes Top 10 趨勢</h2>
        <TrendChart data={rows.slice(0, 10).map((r: any) => ({ name: r.hfId, likes: r.likes ?? 0 }))} />
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Trending {kind}s</h2>
        <table className="data">
          <thead>
            <tr><th>#</th><th>ID</th><th>Likes</th><th>Downloads</th><th>Task</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={`${r.hfId}-${i}`}>
                <td>{r.rank ?? i + 1}</td>
                <td className="font-mono">
                  <a className="link" href={`https://huggingface.co/${kind === "model" ? "" : kind + "s/"}${r.hfId}`} target="_blank">
                    {r.hfId}
                  </a>
                </td>
                <td>{r.likes}</td>
                <td>{r.downloads ?? "-"}</td>
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
