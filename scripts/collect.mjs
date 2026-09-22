// 本機 / CI 用收集器：node scripts/collect.mjs
// 直接打 HF API，寫入 Prisma DB（SQLite MVP）。失敗重試 3 次。
import { PrismaClient } from "@prisma/client";

const API = "https://huggingface.co/api";
const db = new PrismaClient();
const HF_TOKEN = process.env.HF_TOKEN ?? "";
const headers = { "User-Agent": "hf-monitor/0.1", ...(HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}) };

async function fetchList(kind, sort, limit = 100) {
  const path = kind === "model" ? "models" : kind === "dataset" ? "datasets" : "spaces";
  const url = `${API}/${path}?sort=${sort}&direction=-1&limit=${limit}`;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers });
    if (r.ok) return r.json();
    console.warn(`retry ${i + 1} ${kind}/${sort} ${r.status}`);
    await new Promise((s) => setTimeout(s, 2000 * (i + 1)));
  }
  throw new Error(`HF fetch failed ${kind}/${sort}`);
}

const kinds = ["model", "dataset", "space"];
const sorts = ["likes", "downloads"];
let total = 0;
for (const kind of kinds) {
  for (const sort of sorts) {
    try {
      const items = await fetchList(kind, sort);
      await db.snapshot.deleteMany({ where: { kind, sortBy: sort } }).catch(() => {});
      await db.snapshot.createMany({
        data: items.map((x, i) => ({
          kind, hfId: x.id ?? x.name, author: x.author ?? null,
          likes: x.likes ?? 0, downloads: x.downloads ?? 0,
          task: x.pipeline_tag ?? null, tags: JSON.stringify(x.tags ?? []),
          lastModified: x.lastModified ?? null, rank: i + 1, sortBy: sort,
        })),
      });
      for (const x of items.slice(0, 20)) {
        await db.metricHistory.create({
          data: { kind, hfId: x.id ?? x.name, likes: x.likes ?? 0, downloads: x.downloads ?? 0 },
        }).catch(() => {});
      }
      total += items.length;
      console.log(`ok ${kind}/${sort} n=${items.length}`);
    } catch (e) {
      console.error(`fail ${kind}/${sort}`, e.message);
    }
  }
}
console.log(`done total=${total}`);
await db.$disconnect();
