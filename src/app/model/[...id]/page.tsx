import { db } from "@/lib/db";
import { fetchOne } from "@/lib/hf";
import HistoryLine from "@/components/HistoryLine";

export const revalidate = 600;

function hfUrl(kind: string, hfId: string) {
  const seg = kind === "model" ? "" : kind === "dataset" ? "datasets/" : "spaces/";
  return `https://huggingface.co/${seg}${hfId}`;
}

export default async function ModelPage({
  params,
  searchParams,
}: {
  params: { id: string[] };
  searchParams: { kind?: string };
}) {
  const hfId = params.id.join("/");
  const kind = (searchParams.kind ?? "model") as "model" | "dataset" | "space";

  const [hist, live] = await Promise.all([
    db.metricHistory
      .findMany({ where: { kind, hfId }, orderBy: { createdAt: "asc" }, take: 500 })
      .catch(() => []),
    fetchOne(kind, hfId).catch(() => null),
  ]);

  const likes = live?.likes ?? hist.at(-1)?.likes ?? null;
  const downloads = live?.downloads ?? hist.at(-1)?.downloads ?? null;

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
        <div className="card"><div className="muted">Likes</div><div className="text-2xl font-bold">{likes?.toLocaleString?.() ?? "-"}</div></div>
        <div className="card"><div className="muted">Downloads</div><div className="text-2xl font-bold">{downloads?.toLocaleString?.() ?? "-"}</div></div>
        <div className="card"><div className="muted">Last modified</div><div className="text-lg">{live?.lastModified?.slice(0, 10) ?? live?.createdAt?.slice(0, 10) ?? "-"}</div></div>
        <div className="card"><div className="muted">歷史點數</div><div className="text-2xl font-bold">{hist.length}</div></div>
      </div>

      {live?.tags?.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {(live.tags as string[]).slice(0, 30).map((t: string) => (
              <span key={t} className="rounded-full border border-zinc-700 px-3 py-0.5 text-xs text-zinc-300">{t}</span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-2 font-semibold">歷史走勢（每小時收集）</h2>
        {hist.length >= 2 ? (
          <HistoryLine
            data={hist.map((h) => ({
              t: new Date(h.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }),
              likes: h.likes,
              downloads: h.downloads,
            }))}
          />
        ) : (
          <p className="muted">歷史數據累積中（每小時一筆，兩筆以上才畫線）。等 Actions 跑幾輪再回來看。</p>
        )}
      </div>
    </main>
  );
}
