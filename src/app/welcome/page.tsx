import { db } from "@/lib/db";
import { mergeAbsByMinute, fmtT } from "@/lib/absMerge";
import WatchSpark from "@/components/WatchSpark";
import CountUp from "@/components/CountUp";
import { A_COLOR, B_COLOR } from "@/components/CompareClient";
import CompareChartView from "@/components/CompareChart";

export const revalidate = 600;

const KINDS = ["model", "dataset", "space"] as const;
const SORTS = ["trendingScore", "likes", "downloads", "lastModified"] as const;

function fmtFull(d: Date) {
  return d.toLocaleString("en-US", { timeZone: "Asia/Taipei", hour12: false });
}

function ageText(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `Updated ${m} min ago`;
  return `Updated ${Math.floor(m / 60)}h ago`;
}

type Row = { kind: string; hfId: string; likes: number; createdAt: Date };

// 玩票 showcase 頁：純展示，不擋 `/`；數字全是活的，壞了顯示 －
export default async function WelcomePage() {
  let latest: Date | null = null;
  let histTotal: number | null = null;
  let histDay: number | null = null;
  let watchCount: number | null = null;
  let gainers: Record<string, { hfId: string; pct: number | null; grow: number; pts: number[] }[]> = {};
  let kindCards: { kind: string; count: number; deltaPct: number | null; pts: number[] }[] = [];
  let pkA = "";
  let pkB = "";
  let pkRows: Record<string, any>[] = [];
  let pkVerdict = "Accumulating data.";

  try {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [s, hTotal, hDay, wCount] = await Promise.all([
      db.snapshot.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      db.metricHistory.count(),
      db.metricHistory.count({ where: { createdAt: { gte: dayAgo } } }),
      db.watch.count(),
    ]);
    latest = s ? new Date(s.createdAt) : null;
    histTotal = hTotal;
    histDay = hDay;
    watchCount = wCount;

    // 各類別 24h 漲幅 Top3（同 repo 取首尾，附 sparkline）
    const day = (await db.metricHistory
      .findMany({
        where: { createdAt: { gte: new Date(Date.now() - 25 * 3600 * 1000) } },
        select: { kind: true, hfId: true, likes: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 20000,
      })
      .catch(() => [])) as Row[];
    const byRepo = new Map<string, { kind: string; hfId: string; first: number; last: number; pts: number[] }>();
    for (const h of day) {
      const k = `${h.kind}/${h.hfId}`;
      let e = byRepo.get(k);
      if (!e) {
        e = { kind: h.kind, hfId: h.hfId, first: h.likes, last: h.likes, pts: [] };
        byRepo.set(k, e);
      }
      e.last = h.likes;
      e.pts.push(h.likes);
    }
    for (const k of KINDS) {
      gainers[k] = Array.from(byRepo.values())
        .filter((e) => e.kind === k && e.pts.length >= 2 && e.first > 0)
        .map((e) => ({
          hfId: e.hfId,
          grow: e.last - e.first,
          pct: ((e.last - e.first) / e.first) * 100,
          pts: e.pts.slice(-24),
        }))
        .sort((x, y) => y.pct! - x.pct!)
        .slice(0, 3);
    }

    // 各類別：本輪收錄數、較上一輪變化、7 天迷你曲線（只吃熱門榜，避免四榜重複計數）
    const week = (await db.metricHistory
      .findMany({
        where: { kind: { in: [...KINDS] }, sortBy: "trendingScore", createdAt: { gte: weekAgo } },
        select: { kind: true, likes: true, createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 20000,
      })
      .catch(() => [])) as { kind: string; likes: number; createdAt: Date }[];
    const rounds = new Map<string, { time: number; byKind: Map<string, { n: number; likes: number }> }>();
    for (const h of week) {
      const key = fmtT(new Date(h.createdAt));
      let r = rounds.get(key);
      if (!r) {
        r = { time: new Date(h.createdAt).getTime(), byKind: new Map() };
        rounds.set(key, r);
      }
      const e = r.byKind.get(h.kind) || { n: 0, likes: 0 };
      e.n += 1;
      e.likes += h.likes ?? 0;
      r.byKind.set(h.kind, e);
    }
    const ordered = Array.from(rounds.values()).sort((x, y) => x.time - y.time);
    kindCards = KINDS.map((k) => {
      const lastR = ordered[ordered.length - 1]?.byKind.get(k);
      const prevR = ordered[ordered.length - 2]?.byKind.get(k);
      const deltaPct =
        lastR && prevR && prevR.likes > 0 ? ((lastR.likes - prevR.likes) / prevR.likes) * 100 : null;
      return {
        kind: k,
        count: lastR?.n ?? 0,
        deltaPct,
        pts: ordered.map((r) => r.byKind.get(k)?.likes ?? 0).slice(-48),
      };
    }).filter((c) => c.pts.some((v) => v > 0));

    // PK 示意：本輪 models 按 likes 取前二，畫真實 7 天對比
    const top2 = await db.snapshot
      .findMany({ where: { kind: "model" }, orderBy: [{ createdAt: "desc" }, { likes: "desc" }], take: 2 })
      .catch(() => []);
    if (top2.length === 2) {
      pkA = top2[0].hfId;
      pkB = top2[1].hfId;
      const [hA, hB] = await Promise.all([
        db.metricHistory
          .findMany({ where: { kind: "model", hfId: pkA, createdAt: { gte: weekAgo } }, orderBy: { createdAt: "asc" }, take: 2000 })
          .catch(() => []),
        db.metricHistory
          .findMany({ where: { kind: "model", hfId: pkB, createdAt: { gte: weekAgo } }, orderBy: { createdAt: "asc" }, take: 2000 })
          .catch(() => []),
      ]);
      const mA = mergeAbsByMinute(hA as any);
      const mB = mergeAbsByMinute(hB as any);
      const times = new Map<string, number>();
      for (const [k, v] of Array.from(mA.entries()).concat(Array.from(mB.entries()))) {
        if (!times.has(k)) times.set(k, v.time);
      }
      const keys = Array.from(times.entries())
        .sort((x, y) => x[1] - y[1])
        .map(([t]) => t);
      pkRows = keys.map((t) => ({ t, a: mA.get(t)?.likes ?? null, b: mB.get(t)?.likes ?? null }));
      const overlap = keys.filter((t) => mA.get(t) != null && mB.get(t) != null);
      if (overlap.length >= 2) {
        const gA = mA.get(overlap[overlap.length - 1])!.likes - mA.get(overlap[0])!.likes;
        const gB = mB.get(overlap[overlap.length - 1])!.likes - mB.get(overlap[0])!.likes;
        pkVerdict = gA === gB ? "Evenly matched." : `${gA > gB ? pkA : pkB} Leading for now.`;
      }
    }
  } catch {
    // 數字拿不到就顯示 －，頁面照常
  }

  const ageH = latest ? (Date.now() - latest.getTime()) / 3600000 : Infinity;
  const fresh = ageH <= 2;

  return (
    <main className="grid gap-6">
      {/* Hero：左文右圖 */}
      <div className="grid items-center gap-6 md:grid-cols-2">
        <div className="grid gap-4">
          <div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              title={latest ? fmtFull(latest) : "No snapshot yet"}
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${fresh ? "bg-emerald-500" : "bg-amber-500"}`} />
              {latest ? ageText(Date.now() - latest.getTime()) : "Accumulating snapshots"}
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">Trending across Hugging Face<br />Updated hourly</h1>
          <p className="muted max-w-[46ch] text-balance">Three categories, four leaderboards, with history curves and spike alerts. It yells on its own when down.</p>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/" className="pill-active !px-6 !py-2 !text-base">
              Enter dashboard
            </a>
            <a
              href="https://github.com/ryanran8787-a11y/hf-monitor-dashboard"
              target="_blank"
              className="pill !px-6 !py-2 !text-base"
            >
              GitHub
            </a>
          </div>
        </div>

        <div className="wcard">
          <div className="section-title mb-3">Top hourly gainers</div>
          <div className="grid gap-4">
            {KINDS.map((k) => (
              <div key={k}>
                <div className="muted mb-1 font-mono text-xs">{k}s</div>
                {(gainers[k] ?? []).length === 0 ? (
                  <p className="muted text-xs">Accumulating.</p>
                ) : (
                  <div className="grid gap-1">
                    {(gainers[k] ?? []).map((g) => (
                      <div key={g.hfId} className="flex items-center gap-2 text-[13px]">
                        <span className="min-w-0 flex-1 truncate font-mono" title={g.hfId}>
                          {g.hfId}
                        </span>
                        <WatchSpark points={g.pts} animate />
                        <span
                          className={`w-16 shrink-0 text-right tabular-nums ${
                            g.pct! > 0 ? "text-emerald-600 dark:text-emerald-400" : g.pct! < 0 ? "text-rose-600 dark:text-rose-400" : ""
                          }`}
                        >
                          {g.pct! > 0 ? "+" : ""}
                          {g.pct!.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 站內有什麼 */}
      <div>
        <h2 className="section-title mb-3">What's inside</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="wcard md:col-span-2 md:row-span-2">
            <div className="section-title mb-1">12 rounds every hour</div>
            <p className="muted mb-4 text-sm">Three categories times four leaderboards go into snapshots. Top 20 keeps history curves. Discord alerts on spikes, digest at 08:00.</p>
            <div className="grid gap-3">
              {kindCards.length === 0 && <p className="muted text-xs">Accumulating snapshots.</p>}
              {kindCards.map((c) => (
                <div key={c.kind} className="grid grid-cols-[86px_1fr] items-center gap-3 sm:grid-cols-[86px_auto_1fr]">
                  <span className="font-mono text-[13px]">{c.kind}s</span>
                  <span className="hidden text-xs tabular-nums sm:block">
                    {c.count} seats this round
                    {c.deltaPct != null && (
                      <span className={c.deltaPct > 0 ? "text-emerald-600 dark:text-emerald-400" : c.deltaPct < 0 ? "text-rose-600 dark:text-rose-400" : ""}>
                      {` ${c.deltaPct > 0 ? "▲" : c.deltaPct < 0 ? "▼" : ""}${Math.abs(c.deltaPct).toFixed(1)}%`}
                      </span>
                    )}
                  </span>
                  <WatchSpark points={c.pts} animate />
                </div>
              ))}
            </div>
          </div>
          <div className="wcard">
            <div className="section-title mb-1">Head-to-head</div>
            {pkRows.length >= 2 ? (
              <>
                <CompareChartView
                  data={pkRows}
                  series={[
                    { key: "a", label: pkA, color: A_COLOR },
                    { key: "b", label: pkB, color: B_COLOR },
                  ]}
                />
                <p className="muted mt-1 text-xs">{pkVerdict}</p>
              </>
            ) : (
              <p className="muted text-sm">Pick any two repos, compare 7d growth, get an automatic verdict.</p>
            )}
          </div>
          <div className="wcard">
            <div className="section-title mb-1">Watchdog</div>
            <p className="flex items-center gap-1.5 text-sm">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${fresh ? "bg-emerald-500" : "bg-amber-500"}`} />
              {fresh ? "Running" : "Data stale, checking collection"}
            </p>
            <p className="muted mt-1 text-xs tabular-nums">Latest data {latest ? fmtT(latest) : "－"}</p>
          </div>
        </div>
      </div>

      {/* 統計列 */}
      <div className="wcard flex gap-6 overflow-x-auto !p-0 sm:grid sm:grid-cols-3 sm:gap-0 sm:overflow-visible">
        <div className="min-w-[170px] flex-1 px-4 py-5 text-center">
          <div className="muted text-xs">History rows</div>
          <div className="mt-1 font-mono text-xl tabular-nums sm:text-2xl">
            {histTotal != null ? <CountUp value={histTotal} /> : "－"}
          </div>
          <div className="muted mt-0.5 text-xs tabular-nums">{histDay != null ? `+${histDay.toLocaleString()} / 24h` : ""}</div>
        </div>
        <div className="min-w-[170px] flex-1 border-l border-[var(--line)] px-4 py-5 text-center">
          <div className="muted text-xs">Watching</div>
          {watchCount == null ? (
            <div className="mt-1 font-mono text-xl tabular-nums sm:text-2xl">－</div>
          ) : watchCount === 0 ? (
            <div className="mt-1 text-sm">
              <p className="muted">No watched repos yet</p>
              <a className="link" href="/?kind=model">
                Add your first from the leaderboard
              </a>
            </div>
          ) : (
            <div className="mt-1 font-mono text-xl tabular-nums sm:text-2xl">{watchCount}/50</div>
          )}
        </div>
        <div className="min-w-[170px] flex-1 border-l border-[var(--line)] px-4 py-5 text-center">
          <div className="muted text-xs">Latest snapshot</div>
          <div className="mt-1 font-mono text-xl tabular-nums sm:text-2xl">{latest ? fmtT(latest) : "－"}</div>
          <div className="muted mt-0.5 text-xs">Taipei time</div>
        </div>
      </div>
    </main>
  );
}
