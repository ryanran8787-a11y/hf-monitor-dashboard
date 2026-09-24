import { db } from "@/lib/db";
import { fetchList } from "@/lib/hf";
import TrendChart from "@/components/TrendChart";
import TaskBars, { TaskSlice } from "@/components/TaskBars";
import TaskShareChart, { ShareSeries } from "@/components/TaskShareChart";

export const revalidate = 600;

const TASK_COLORS = ["#0284c7", "#ea580c", "#7c3aed", "#059669", "#e11d48", "#64748b"];

function fmtT(d: Date) {
  return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

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
  // 快照陳舊度：抓取失敗時舊快照會留著，不能當新鮮的畫——超 2 小時就掛警告
  const snapAgeH =
    !live && rows.length > 0
      ? (Date.now() - new Date((rows[0] as any).createdAt).getTime()) / 3600000
      : 0;

  // ---- 流派分析（只做 model：datasets/spaces 的 task 幾乎全空）----
  let taskSlices: TaskSlice[] = [];
  let taskTotalLikes = 0;
  let shareRows: Record<string, any>[] = [];
  let shareSeries: ShareSeries[] = [];
  if (kind === "model") {
    // 版圖：當期熱門榜 Top50 按 task 分組（快照現成，零額外成本）
    const snap = await db.snapshot
      .findMany({
        where: { kind: "model", sortBy: "trendingScore" },
        orderBy: [{ createdAt: "desc" }, { rank: "asc" }],
        take: 50,
      })
      .catch(() => []);
    const byTask = new Map<string, { count: number; likes: number }>();
    for (const r of snap) {
      const t = r.task || "未分類";
      const e = byTask.get(t) || { count: 0, likes: 0 };
      e.count += 1;
      e.likes += r.likes ?? 0;
      byTask.set(t, e);
    }
    const all = Array.from(byTask.entries())
      .map(([task, v]) => ({ task, count: v.count, likes: v.likes }))
      .sort((x, y) => y.likes - x.likes);
    taskTotalLikes = all.reduce((n, s) => n + s.likes, 0);
    const top = all.slice(0, 8);
    const rest = all.slice(8);
    taskSlices =
      rest.length > 0
        ? top.concat([{ task: "其他", count: rest.reduce((n, s) => n + s.count, 0), likes: rest.reduce((n, s) => n + s.likes, 0) }])
        : top;

    // 趨勢：每輪各 task 的 likes 佔比（task 欄 2026-09-23 起才寫，舊輪次跳過）
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const hist = await db.metricHistory
      .findMany({
        where: { kind: "model", sortBy: "trendingScore", createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        take: 5000,
      })
      .catch(() => []);
    const rounds = new Map<string, { time: number; byTask: Map<string, number>; total: number }>();
    for (const h of hist) {
      if (!(h as any).task) continue;
      const k = fmtT(new Date(h.createdAt));
      let r = rounds.get(k);
      if (!r) {
        r = { time: new Date(h.createdAt).getTime(), byTask: new Map(), total: 0 };
        rounds.set(k, r);
      }
      const t = (h as any).task as string;
      r.byTask.set(t, (r.byTask.get(t) || 0) + (h.likes ?? 0));
      r.total += h.likes ?? 0;
    }
    const taskTotals = new Map<string, number>();
    for (const r of Array.from(rounds.values())) {
      for (const [t, v] of Array.from(r.byTask.entries())) taskTotals.set(t, (taskTotals.get(t) || 0) + v);
    }
    const topTasks = Array.from(taskTotals.entries())
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .map(([t]) => t);
    const keys = ["t0", "t1", "t2", "t3", "t4", "other"];
    shareSeries = topTasks
      .map((t, i) => ({ key: keys[i], label: t, color: TASK_COLORS[i] }))
      .concat([{ key: "other", label: "其他", color: TASK_COLORS[5] }]);
    shareRows = Array.from(rounds.entries())
      .sort((x, y) => x[1].time - y[1].time)
      .map(([t, r]) => {
        // 先全部補 0：某輪缺席的 task 畫 0 而非斷線
        const row: Record<string, any> = { t, t0: 0, t1: 0, t2: 0, t3: 0, t4: 0, other: 0 };
        let other = 0;
        for (const [task, v] of Array.from(r.byTask.entries())) {
          const i = topTasks.indexOf(task);
          if (i >= 0) row[keys[i]] = r.total > 0 ? (v / r.total) * 100 : 0;
          else other += v;
        }
        row.other = r.total > 0 ? (other / r.total) * 100 : 0;
        return row;
      });
    // 佔比本身幾乎不動，堆疊圖看不出變化：改以「首日=100」指數化，只看消長方向
    const firstBase: Record<string, number> = {};
    for (const row of shareRows) {
      for (const k of keys) {
        if (!(k in firstBase) && row[k] > 0) firstBase[k] = row[k];
      }
    }
    shareRows = shareRows.map((row) => {
      const o: Record<string, any> = { t: row.t };
      for (const k of keys) o[k] = firstBase[k] ? (row[k] / firstBase[k]) * 100 : 100;
      return o;
    });
  }

  return (
    <main className="grid gap-4">
      <div className="card flex flex-wrap items-center gap-2 !p-3">
        {(["model", "dataset", "space"] as const).map((k) => (
          <a key={k} href={`/?kind=${k}&sort=${sort}`} className={kind === k ? "pill-active" : "pill"}>
            {k}s
          </a>
        ))}
        <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
        {SORTS.map((s) => (
          <a key={s.key} href={`/?kind=${kind}&sort=${s.key}`} className={sort === s.key ? "pill-active" : "pill"}>
            {s.label}
          </a>
        ))}
        <span className="muted ml-auto flex items-center gap-1.5 text-xs">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-amber-500" : "bg-emerald-500"}`} />
          {live ? "即時 HF API" : "DB 快照"} · {kind} / {sort}
        </span>
        {!live && snapAgeH > 2 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            快照已 {Math.floor(snapAgeH)} 小時未更新，收集可能中斷
          </span>
        )}
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

            {kind === "model" && (
        <div className="card">
          <h2 className="section-title mb-1">流派版圖（熱門榜 Top50）</h2>
          <p className="muted mb-3 text-xs">當期各任務流派的席次與 likes 佔比；下圖是佔比隨時間的消長。</p>
          <TaskBars items={taskSlices} totalLikes={taskTotalLikes} />
        </div>
      )}

      {kind === "model" && (
        <div className="card">
          <h2 className="section-title mb-1">流派趨勢（近 7 天，台北時間）</h2>
          <p className="muted mb-3 text-xs">各流派佔比以首日=100 指數化，只看消長方向（虛線=首日基準）。</p>
          {shareRows.length >= 2 ? (
            <TaskShareChart data={shareRows} series={shareSeries} />
          ) : (
            <p className="muted">趨勢累積中（task 欄位剛上線，等下幾輪收集才有線）。版圖是即時的，不受影響。</p>
          )}
        </div>
      )}

      <div className="card overflow-x-auto !p-0">
        <h2 className="section-title px-5 pb-1 pt-5">{sortLabel} {kind}s Top 50</h2>
        <table className="data min-w-[640px]">
          <thead>
            <tr><th className="w-10">#</th><th>ID</th><th className="text-right">Likes</th><th className="text-right">Downloads</th><th>Task</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={`${r.hfId}-${i}`}>
                <td className="tabular-nums text-zinc-400 dark:text-zinc-500">{r.rank ?? i + 1}</td>
                <td className="font-mono text-[13px]">
                  <a className="link" href={`/model/${r.hfId}?kind=${kind}`}>
                    {r.hfId}
                  </a>
                </td>
                <td className="text-right tabular-nums">{r.likes?.toLocaleString?.() ?? r.likes}</td>
                <td className="text-right tabular-nums">{r.downloads?.toLocaleString?.() ?? r.downloads ?? "-"}</td>
                <td><span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{r.task ?? "-"}</span></td>
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
