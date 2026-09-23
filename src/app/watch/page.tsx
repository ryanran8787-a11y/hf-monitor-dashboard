import { db } from "@/lib/db";
import WatchAdder from "@/components/WatchAdder";
import WatchToggle from "@/components/WatchToggle";
import WatchSpark from "@/components/WatchSpark";

export const revalidate = 600;

function fmtD(d: Date) {
  return d.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour12: false });
}

export default async function WatchPage() {
  const watches = await db.watch.findMany({ orderBy: { createdAt: "desc" } }).catch(() => []);

  // 每台近 25h 的點：現價＋24h 變化＋sparkline（一次查完，程式裡分組）
  const stats = new Map<string, { likes: number[]; first: number; last: number; dl: number }>();
  if (watches.length > 0) {
    const hist = await db.metricHistory
      .findMany({
        where: {
          OR: watches.map((w) => ({ kind: w.kind, hfId: w.hfId })),
          createdAt: { gte: new Date(Date.now() - 25 * 3600 * 1000) },
        },
        orderBy: { createdAt: "asc" },
        take: 10000,
      })
      .catch(() => []);
    const lastDl = new Map<string, number>();
    for (const h of hist) {
      const k = `${h.kind}/${h.hfId}`;
      let s = stats.get(k);
      if (!s) {
        s = { likes: [], first: h.likes, last: h.likes, dl: h.downloads };
        stats.set(k, s);
      }
      s.likes.push(h.likes);
      s.last = h.likes;
      lastDl.set(k, h.downloads);
    }
    for (const [k, dl] of Array.from(lastDl.entries())) stats.get(k)!.dl = dl;
  }

  return (
    <main className="grid gap-4">
      <div className="card">
        <h2 className="section-title mb-1">追蹤清單（{watches.length}/50）</h2>
        <p className="muted mb-3 text-xs">冷門模型也追得：加入後每輪收集會多抓一次，沒進榜也有曲線。取消後歷史保留、只停更。</p>
        <WatchAdder />
      </div>

      {watches.length === 0 ? (
        <div className="card muted">還沒追蹤任何模型，用上面搜尋框加一台。</div>
      ) : (
        <div className="card overflow-x-auto !p-0">
          <table className="data">
            <thead>
              <tr><th>ID</th><th className="text-right">Likes</th><th className="text-right">24h 變化</th><th>走勢</th><th>開始追蹤</th><th></th></tr>
            </thead>
            <tbody>
              {watches.map((w) => {
                const s = stats.get(`${w.kind}/${w.hfId}`);
                const delta = s && s.likes.length >= 2 ? s.last - s.first : null;
                return (
                  <tr key={`${w.kind}/${w.hfId}`}>
                    <td className="font-mono text-[13px]">
                      <span className="muted mr-2 text-xs">[{w.kind}]</span>
                      <a className="link" href={`/model/${w.hfId}?kind=${w.kind}`}>
                        {w.hfId}
                      </a>
                    </td>
                    <td className="text-right tabular-nums">{s ? s.last.toLocaleString() : "-"}</td>
                    <td className={`text-right tabular-nums ${delta != null && delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta != null && delta < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                      {delta != null ? `${delta > 0 ? "+" : ""}${delta.toLocaleString()}` : "-"}
                    </td>
                    <td>{s ? <WatchSpark points={s.likes.slice(-48)} /> : <span className="muted text-xs">累積中</span>}</td>
                    <td className="muted whitespace-nowrap tabular-nums">{fmtD(new Date(w.createdAt))}</td>
                    <td><WatchToggle kind={w.kind} hfId={w.hfId} initial={true} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
