import { db } from "@/lib/db";
import { mergeAbsByMinute, fmtT, AbsMerged } from "@/lib/absMerge";
import CompareClient, { Summary } from "@/components/CompareClient";
import { Candidate } from "@/components/ModelPicker";

export const revalidate = 600;

const WINDOW_DAYS = 7;
const KINDS = ["model", "dataset", "space"] as const;

type H = { createdAt: Date; likes: number; downloads: number; rank: number | null; sortBy: string };

function orderKeys(times: Map<string, number>) {
  return Array.from(times.entries()).sort((x, y) => x[1] - y[1]).map(([t]) => t);
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { kind?: string; a?: string; b?: string };
}) {
  const kind = (KINDS as readonly string[]).includes(searchParams.kind ?? "")
    ? searchParams.kind!
    : "model";
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);

  // 有歷史資料的候選（按 likes 排，預設拿前二當 A/B）
  const groups = await db.metricHistory
    .groupBy({
      by: ["hfId"],
      where: { kind },
      _max: { likes: true, createdAt: true },
      _count: { _all: true },
      orderBy: { _max: { likes: "desc" } },
      take: 300,
    })
    .catch(() => []);
  const candidates: Candidate[] = groups.map((g) => ({
    hfId: g.hfId,
    likes: g._max.likes ?? 0,
    points: (g._count as any)?._all ?? 0,
    updatedAt: g._max.createdAt ? g._max.createdAt.toISOString() : new Date(0).toISOString(),
  }));

  const a = searchParams.a || candidates[0]?.hfId || "";
  const b = searchParams.b || candidates[1]?.hfId || candidates[0]?.hfId || "";

  const [histA, histB] = await Promise.all([
    a ? db.metricHistory.findMany({ where: { kind, hfId: a, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: 2000 }).catch(() => []) : Promise.resolve([] as H[]),
    b ? db.metricHistory.findMany({ where: { kind, hfId: b, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: 2000 }).catch(() => []) : Promise.resolve([] as H[]),
  ]);

  // ---- 絕對值對比 ----
  const absA = mergeAbsByMinute(histA);
  const absB = mergeAbsByMinute(histB);
  const absTimes = new Map<string, number>();
  for (const [k, v] of Array.from(absA.entries()).concat(Array.from(absB.entries()))) {
    if (!absTimes.has(k)) absTimes.set(k, v.time);
  }
  const absKeys = orderKeys(absTimes);
  const likesRows = absKeys.map((t) => ({ t, a: absA.get(t)?.likes ?? null, b: absB.get(t)?.likes ?? null }));
  const dlRows = absKeys.map((t) => ({ t, a: absA.get(t)?.downloads ?? null, b: absB.get(t)?.downloads ?? null }));

  // ---- 排名對比（只取熱門榜） ----
  const rankA = new Map<string, number>();
  const rankB = new Map<string, number>();
  const rankTimes = new Map<string, number>();
  for (const [h, m] of [[...histA], [...histB]].map((arr, i) => [arr, i === 0 ? rankA : rankB] as const)) {
    for (const r of h as H[]) {
      if (r.sortBy !== "trendingScore" || r.rank == null) continue;
      const k = fmtT(new Date(r.createdAt));
      m.set(k, r.rank); // 同分鐘重跑留最新；時間戳同步更新，否則值與 x 軸錯位
      rankTimes.set(k, new Date(r.createdAt).getTime());
    }
  }
  const rankKeys = orderKeys(rankTimes);
  const rankRows = rankKeys.map((t) => ({ t, a: rankA.get(t) ?? null, b: rankB.get(t) ?? null }));

  // ---- 判決（只比「兩邊都有資料」的重疊窗口，窗口不同直接比首尾會失真）----
  const overlap = absKeys.filter((t) => absA.get(t)?.likes != null && absB.get(t)?.likes != null);
  const growOf = (m: Map<string, AbsMerged>) =>
    overlap.length >= 2 ? m.get(overlap[overlap.length - 1])!.likes - m.get(overlap[0])!.likes : null;
  const aGrowLikes = growOf(absA);
  const bGrowLikes = growOf(absB);
  const rA = rankKeys.map((t) => rankA.get(t)).filter((v) => v != null) as number[];
  const rB = rankKeys.map((t) => rankB.get(t)).filter((v) => v != null) as number[];
  let verdict = "資料累積中（兩邊各要 2 筆以上），等收集多跑幾輪再回來看。";
  if (aGrowLikes != null && bGrowLikes != null && a !== "" && b !== "" && a !== b) {
    if (aGrowLikes === bGrowLikes) verdict = "同期平分秋色，兩邊吸粉一樣快。";
    else {
      const w = aGrowLikes > bGrowLikes ? a : b;
      verdict = `${w} 同期多吸 ${Math.abs(aGrowLikes - bGrowLikes).toLocaleString()} 個 likes，暫時領先。`;
    }
  }
  const summary: Summary = {
    aGrowLikes,
    bGrowLikes,
    aRankFirst: rA[0] ?? null,
    aRankLast: rA.length > 0 ? rA[rA.length - 1] : null,
    bRankFirst: rB[0] ?? null,
    bRankLast: rB.length > 0 ? rB[rB.length - 1] : null,
    verdict,
  };

  return (
    <CompareClient
      kind={kind}
      a={a}
      b={b}
      candidates={candidates}
      likesRows={likesRows}
      dlRows={dlRows}
      rankRows={rankRows}
      summary={summary}
    />
  );
}
