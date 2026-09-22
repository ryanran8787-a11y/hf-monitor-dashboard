import { db } from "@/lib/db";
import { fetchOne } from "@/lib/hf";
import HistoryLine from "@/components/HistoryLine";
import RankChart from "@/components/RankChart";

export const revalidate = 600;

const WINDOW_DAYS = 7;

const SORT_META: Record<string, { label: string; color: string }> = {
  trendingScore: { label: "熱門", color: "#d97706" },
  likes: { label: "Likes", color: "#0284c7" },
  downloads: { label: "下載", color: "#ea580c" },
  lastModified: { label: "新動態", color: "#7c3aed" },
};

function hfUrl(kind: string, hfId: string) {
  const seg = kind === "model" ? "" : kind === "dataset" ? "datasets/" : "spaces/";
  return `https://huggingface.co/${seg}${hfId}`;
}

function fmtT(d: Date) {
  return d.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export default async function ModelPage({
  params,
  searchParams,
}: {
  params: { id: string[] };
  searchParams: { kind?: string };
}) {
  const hfId = params.id.join("/");
  const kind = (["model", "dataset", "space"] as const).includes(searchParams.kind as any)
    ? (searchParams.kind as "model" | "dataset" | "space")
    : "model";

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  const [hist, live] = await Promise.all([
    db.metricHistory
      .findMany({ where: { kind, hfId, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: 2000 })
      .catch(() => []),
    fetchOne(kind, hfId).catch(() => null),
  ]);

  const likes = live?.likes ?? hist.at(-1)?.likes ?? null;
  const downloads = live?.downloads ?? hist.at(-1)?.downloads ?? null;

  // ---- 絕對值曲線：同時間多榜單會重複，取 likes 榜優先，否則任一 ----
  const absPool = hist.filter((h) => h.sortBy === "likes");
  const absRows = (absPool.length > 0 ? absPool : hist.filter((h, i, a) => a.findIndex((x) => x.createdAt.getTime() === h.createdAt.getTime()) === i))
    .map((h) => ({ t: fmtT(new Date(h.createdAt)), likes: h.likes, downloads: h.downloads }));

  // ---- 排名曲線：按時間合併各榜單排名 ----
  const byTime = new Map<string, Record<string, any>>();
  for (const h of hist) {
    if (h.rank == null) continue; // 舊資料無 rank，跳過
    const t = fmtT(new Date(h.createdAt));
    if (!byTime.has(t)) byTime.set(t, { t });
    byTime.get(t)![h.sortBy] = h.rank;
  }
  const rankRows = Array.from(byTime.values());
  const seriesPresent = Object.keys(SORT_META).filter((k) => rankRows.some((r) => r[k] != null));
  const series = seriesPresent.map((k) => ({ key: k, ...SORT_META[k] }));

  // ---- 7 天成長統計 ----
  const likeFirst = absRows[0]?.likes;
  const likeLast = absRows.at(-1)?.likes;
  const likeGrow = likeFirst != null && likeLast != null ? likeLast - likeFirst : null;
  const likePct = likeGrow != null && likeFirst > 0 ? (likeGrow / likeFirst) * 100 : null;
  const trendRanks = rankRows.map((r) => r.trendingScore).filter((v) => v != null);
  const rankFirst = trendRanks[0];
  const rankLast = trendRanks.at(-1);
  const rankDelta = rankFirst != null && rankLast != null ? rankFirst - rankLast : null; // 正=爬升

  return (
    <main className="grid gap-4">
      <div>
        <a className="link muted" href={`/?kind=${kind}`}>← 回總覽</a>
        <h1 className="mt-1 break-all font-mono text-2xl font-bold">{hfId}</h1>
        <div className="muted mt-1 flex flex-wrap gap-3 text-sm">
          <span>[{kind}]</span>
          {live?.pipeline_tag && <span>task: {live.pipeline_tag}</span>}
          {live?.library_name && <span>lib: {live.library_name}</span>}
          <a className="link" href={hfUrl(kind, hfId)} target="_blank">HF Hub ↗</a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="card"><div className="muted">Likes</div><div className="stat-num mt-1">{likes?.toLocaleString?.() ?? "-"}</div></div>
        <div className="card"><div className="muted">Downloads</div><div className="stat-num mt-1">{downloads?.toLocaleString?.() ?? "-"}</div></div>
        <div className="card">
          <div className="muted">近 7 天 Likes 成長</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-sky-700">
            {likeGrow != null ? `+${likeGrow.toLocaleString()}${likePct != null ? ` (${likePct.toFixed(1)}%)` : ""}` : "-"}
          </div>
        </div>
        <div className="card">
          <div className="muted">熱門排名變化</div>
          <div className={`mt-1 text-2xl font-semibold tracking-tight ${rankDelta != null && rankDelta > 0 ? "text-emerald-600" : rankDelta != null && rankDelta < 0 ? "text-rose-600" : ""}`}>
            {rankFirst != null && rankLast != null
              ? `#${rankFirst} → #${rankLast}${rankDelta !== 0 ? (rankDelta! > 0 ? ` (▲${rankDelta})` : ` (▼${-rankDelta!})`) : ""}`
              : "未進榜/累積中"}
          </div>
        </div>
      </div>

      {live?.tags?.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-3">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {(live.tags as string[]).slice(0, 30).map((t: string) => (
              <span key={t} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">{t}</span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="section-title mb-3">排名走勢（近 7 天）</h2>
        {rankRows.length >= 2 && series.length > 0 ? (
          <>
            <RankChart data={rankRows} series={series} />
            <p className="muted mt-1 text-xs">只收錄進榜前 20 的時間點；掉出榜單處會斷線。Y 軸越上名次越高。</p>
          </>
        ) : (
          <p className="muted">排名數據累積中（新欄位剛上線，等下幾輪收集才有線）。{hist.length > 0 ? `目前絕對值已有 ${hist.length} 筆。` : ""}</p>
        )}
      </div>

      <div className="card">
        <h2 className="section-title mb-3">Likes / Downloads（近 7 天）</h2>
        {absRows.length >= 2 ? (
          <HistoryLine data={absRows} />
        ) : (
          <p className="muted">歷史數據累積中（每小時一筆，兩筆以上才畫線）。等 Actions 跑幾輪再回來看。</p>
        )}
      </div>
    </main>
  );
}
