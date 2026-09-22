import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchList } from "@/lib/hf";

// POST /api/cron/collect  (Header: x-cron-secret)
// 也可本機跑 node scripts/collect.mjs；此 route 給 Vercel Cron / GitHub Actions 呼叫。
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const kinds = ["model", "dataset", "space"] as const;
  let total = 0;
  for (const kind of kinds) {
    for (const sort of ["likes", "downloads", "trendingScore", "lastModified"] as const) {
      try {
        const items = await fetchList(kind, { sort, limit: 100 });
        await db.snapshot.deleteMany({ where: { kind, sortBy: sort } }).catch(() => {});
        await db.snapshot.createMany({
          data: items.map((x, i) => ({
            kind, hfId: x.id, author: x.author ?? null,
            likes: x.likes, downloads: x.downloads ?? 0,
            task: x.task ?? null, tags: JSON.stringify(x.tags),
            lastModified: x.lastModified ?? null, rank: i + 1, sortBy: sort,
          })),
        }).catch(() => {});
        // Top 20 寫歷史曲線
        for (const x of items.slice(0, 20)) {
          await db.metricHistory.create({
            data: { kind, hfId: x.id, likes: x.likes, downloads: x.downloads ?? 0 },
          }).catch(() => {});
        }
        total += items.length;
      } catch (e) {
        console.error("collect fail", kind, sort, e);
      }
    }
  }
  return NextResponse.json({ ok: true, total });
}
