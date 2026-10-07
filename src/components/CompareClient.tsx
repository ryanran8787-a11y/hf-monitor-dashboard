"use client";
import { useRouter } from "next/navigation";
import ModelPicker, { Candidate } from "./ModelPicker";
import CompareChart from "./CompareChart";
import RankChart from "./RankChart";

export const A_COLOR = "#0284c7";
export const B_COLOR = "#ea580c";

export interface Summary {
  aGrowLikes: number | null;
  bGrowLikes: number | null;
  aRankFirst: number | null;
  aRankLast: number | null;
  bRankFirst: number | null;
  bRankLast: number | null;
  verdict: string;
}

function go(router: ReturnType<typeof useRouter>, kind: string, a: string, b: string) {
  router.push(`/compare?kind=${kind}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
}

export default function CompareClient({
  kind,
  a,
  b,
  candidates,
  likesRows,
  dlRows,
  rankRows,
  summary,
}: {
  kind: string;
  a: string;
  b: string;
  candidates: Candidate[];
  likesRows: Record<string, any>[];
  dlRows: Record<string, any>[];
  rankRows: Record<string, any>[];
  summary: Summary;
}) {
  const router = useRouter();
  const same = a !== "" && a === b;
  const likeSeries = [
    { key: "a", label: a || "A", color: A_COLOR },
    { key: "b", label: b || "B", color: B_COLOR },
  ];

  return (
    <main className="grid gap-4">
      <div className="card flex flex-wrap items-center gap-2 !p-3">
        <a className="link muted text-sm" href="/">
          ← Back to overview
        </a>
        <span className="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
        {(["model", "dataset", "space"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => router.push(`/compare?kind=${k}`)}
            className={kind === k ? "pill-active" : "pill"}
          >
            {k}s
          </button>
        ))}
        <span className="muted ml-auto text-xs">Only repos that made the Top 20 (need history to draw)</span>
      </div>

      <div className="card grid gap-4 md:grid-cols-2">
        <ModelPicker label="Contender A" color={A_COLOR} candidates={candidates} value={a} onChange={(v) => go(router, kind, v, b || v)} />
        <ModelPicker label="Contender B" color={B_COLOR} candidates={candidates} value={b} onChange={(v) => go(router, kind, a || v, v)} />
      </div>

      {same ? (
        <div className="card">Same repo on both sides. Pick a different one.</div>
      ) : (
        <>
          <div className="card border-l-4" style={{ borderLeftColor: A_COLOR }}>
            <div className="muted text-xs">7-day verdict</div>
            <div className="mt-1 text-lg font-semibold tracking-tight">{summary.verdict}</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="card">
              <div className="muted text-xs">Likes growth (7d)</div>
              <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: A_COLOR }}>
                A {summary.aGrowLikes != null ? `+${summary.aGrowLikes.toLocaleString()}` : "-"}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: B_COLOR }}>
                B {summary.bGrowLikes != null ? `+${summary.bGrowLikes.toLocaleString()}` : "-"}
              </div>
            </div>
            <div className="card">
              <div className="muted text-xs">Trending rank change</div>
              <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: A_COLOR }}>
                A {summary.aRankFirst != null && summary.aRankLast != null ? `#${summary.aRankFirst} → #${summary.aRankLast}` : "Unranked / accumulating"}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: B_COLOR }}>
                B {summary.bRankFirst != null && summary.bRankLast != null ? `#${summary.bRankFirst} → #${summary.bRankLast}` : "Unranked / accumulating"}
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="section-title mb-3">Likes compared (7d, Taipei time)</h2>
            {likesRows.length >= 2 ? (
              <CompareChart data={likesRows} series={likeSeries} />
            ) : (
              <p className="muted">Not enough data (each side needs 2+ points). Wait for more rounds.</p>
            )}
          </div>

          <div className="card">
            <h2 className="section-title mb-3">Downloads compared (7d, Taipei time)</h2>
            {dlRows.length >= 2 ? (
              <CompareChart data={dlRows} series={likeSeries} />
            ) : (
              <p className="muted">Not enough data (each side needs 2+ points). Wait for more rounds.</p>
            )}
          </div>

          <div className="card">
            <h2 className="section-title mb-3">Trending rank compared (7d, Taipei time)</h2>
            {rankRows.length >= 2 ? (
              <>
                <RankChart data={rankRows} series={likeSeries.map((s) => ({ ...s }))} />
                <p className="muted mt-1 text-xs">Only Top-20 points. Gaps mean off-chart. Higher = better.</p>
              </>
            ) : (
              <p className="muted">Ranking data accumulating. Needs both sides on-chart.</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
