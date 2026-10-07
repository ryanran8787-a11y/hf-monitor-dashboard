import { db } from "@/lib/db";

export const revalidate = 600;

function fmtT(d: Date) {
  return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

// 玩票 showcase 頁：純展示，不擋 `/`，數字全是活的（讀 DB），壞了就顯示 －
export default async function WelcomePage() {
  let histCount: number | null = null;
  let watchCount: number | null = null;
  let latest: Date | null = null;
  let kinds: { kind: string; n: number }[] = [];
  try {
    const [h, w, s, g] = await Promise.all([
      db.metricHistory.count(),
      db.watch.count(),
      db.snapshot.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      db.snapshot.groupBy({ by: ["kind"], _count: { _all: true } }),
    ]);
    histCount = h;
    watchCount = w;
    latest = s ? new Date(s.createdAt) : null;
    kinds = g.map((x) => ({ kind: x.kind, n: (x._count as any)?._all ?? 0 }));
  } catch {
    // 數字拿不到就顯示 －，頁面照常
  }
  const maxKind = Math.max(1, ...kinds.map((k) => k.n));

  const stats = [
    { label: "歷史筆數", value: histCount != null ? histCount.toLocaleString() : "－" },
    { label: "追蹤中", value: watchCount != null ? `${watchCount}/50` : "－" },
    { label: "最新快照", value: latest ? fmtT(latest) : "－" },
  ];

  return (
    <main className="grid gap-6">
      <div className="rise grid gap-4 py-6 text-center sm:py-10">
        <h1 className="text-4xl font-semibold tracking-tighter md:text-5xl">
          HF 全站熱門
          <br />
          每小時追蹤
        </h1>
        <p className="muted mx-auto max-w-[52ch]">Models、Datasets、Spaces 三大類，四種榜單，附歷史曲線與漲幅告警。</p>
        <div>
          <a href="/" className="pill-active !px-6 !py-2 !text-base">
            進入儀表盤
          </a>
          <div className="mt-3 text-xs">
            <a className="link muted" href="https://github.com/ryanran8787-a11y/hf-monitor-dashboard" target="_blank">
              GitHub 原始碼
            </a>
          </div>
        </div>
      </div>

      <div>
        <h2 className="section-title mb-3">站內有什麼</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card rise-d1 md:col-span-2 md:row-span-2">
            <div className="section-title mb-1">每小時 12 輪收集</div>
            <p className="muted mb-4 text-sm">三類別乘四榜單寫入快照，前 20 名留歷史曲線，超閾值 Discord 告警，早上八點還有日報。</p>
            <div className="grid gap-2">
              {kinds.map((k) => (
                <div key={k.kind} className="grid grid-cols-[90px_1fr_auto] items-center gap-2">
                  <span className="font-mono text-[13px]">{k.kind}s</span>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.max((k.n / maxKind) * 100, 2)}%` }} />
                  </div>
                  <span className="muted text-xs tabular-nums">{k.n.toLocaleString()}</span>
                </div>
              ))}
              {kinds.length === 0 && <p className="muted text-xs">快照累積中。</p>}
            </div>
          </div>
          <div className="card rise-d1">
            <div className="section-title mb-1">雙雄 PK</div>
            <p className="muted text-sm">任選兩台比近 7 天成長，自動給出判決。</p>
          </div>
          <div className="card rise-d2">
            <div className="section-title mb-1">看門狗</div>
            <p className="muted text-sm">斷收超過 3 小時自己喊，不用人盯。</p>
          </div>
        </div>
      </div>

      <div className="card rise-d2 grid grid-cols-3 divide-x divide-zinc-200 !p-0 dark:divide-zinc-800">
        {stats.map((s) => (
          <div key={s.label} className="px-2 py-5 text-center sm:px-4">
            <div className="muted text-xs">{s.label}</div>
            <div className="mt-1 font-mono text-base tabular-nums sm:text-xl">{s.value}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
