// 本機 / CI 用收集器：node scripts/collect.mjs
// 3 kinds × 4 sorts（likes / downloads / trendingScore / lastModified）→ Snapshot + MetricHistory，
// 另做漲幅偵測（Peak 表），突破閾值且有 DISCORD_WEBHOOK_URL 就推播。
// 效能設計：12 輪並行抓取；DB 全部批量寫（createMany + 單次 findMany + 單次 transaction），
// 避免跨洋逐筆來回（Actions runner 在美歐、DB 在雪梨，逐筆要 10 分鐘，批量約 1 分鐘）。
import { PrismaClient } from "@prisma/client";

const API = "https://huggingface.co/api";
const db = new PrismaClient();
const HF_TOKEN = process.env.HF_TOKEN ?? "";
const headers = { "User-Agent": "hf-monitor/0.1", ...(HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}) };
const DISCORD = process.env.DISCORD_WEBHOOK_URL ?? "";
// 告警閾值：下載增量 >= MIN_DL 且漲幅 >= PCT，或 likes 增量 >= MIN_LIKES 且漲幅 >= PCT
const MIN_DL = Number(process.env.SPIKE_MIN_DL ?? 5000);
const MIN_LIKES = Number(process.env.SPIKE_MIN_LIKES ?? 100);
const PCT = Number(process.env.SPIKE_PCT ?? 30);
const MAX_ALERTS = 8;
const TOP_N = 20; // 每榜取前 N 寫歷史 + 峰值比對

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

async function discord(text) {
  if (!DISCORD) return;
  try {
    await fetch(DISCORD, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text.slice(0, 1900) }),
    });
  } catch (e) {
    console.error("discord failed", e.message);
  }
}

const t0 = Date.now();
const kinds = ["model", "dataset", "space"];
const sorts = ["likes", "downloads", "trendingScore", "lastModified"];

// ---- Phase 1：12 輪並行抓取 + 快照寫入 ----
const jobs = [];
for (const kind of kinds) {
  for (const sort of sorts) {
    jobs.push((async () => {
      const items = await fetchList(kind, sort);
      await db.snapshot.deleteMany({ where: { kind, sortBy: sort } }).catch(() => {});
      await db.snapshot.createMany({
        data: items.map((x, i) => ({
          kind, hfId: x.id ?? x.name, author: x.author ?? null,
          likes: x.likes ?? 0, downloads: x.downloads ?? 0,
          task: x.pipeline_tag ?? null, tags: JSON.stringify(x.tags ?? []),
          // 列表 API 只有 createdAt，詳情才有 lastModified
          lastModified: x.lastModified ?? x.last_modified ?? x.createdAt ?? null,
          rank: i + 1, sortBy: sort,
        })),
      });
      return { kind, sort, items };
    })().catch((e) => {
      console.error(`fail ${kind}/${sort}`, e.message);
      return null;
    }));
  }
}
const rounds = (await Promise.all(jobs)).filter(Boolean);
const total = rounds.reduce((n, r) => n + r.items.length, 0);
console.log(`phase1 fetch+snapshots: ${rounds.length}/12 rounds, total=${total}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// 去重：同一 repo 只比對一次峰值
const seen = new Map();
for (const r of rounds) {
  for (const x of r.items.slice(0, TOP_N)) {
    const hfId = x.id ?? x.name;
    const key = `${r.kind}/${hfId}`;
    if (!seen.has(key)) {
      seen.set(key, { kind: r.kind, hfId, likes: x.likes ?? 0, downloads: x.downloads ?? 0 });
    }
  }
}

// ---- Phase 2：歷史曲線一次批量寫 ----
const cur = [...seen.values()];
await db.metricHistory.createMany({
  data: cur.map((c) => ({ kind: c.kind, hfId: c.hfId, likes: c.likes, downloads: c.downloads })),
}).catch((e) => console.error("history createMany failed", e.message));
console.log(`phase2 history: ${cur.length} rows, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ---- Phase 3：峰值一次查出、差異一次 transaction 寫回 ----
const prevRows = await db.peak
  .findMany({ where: { OR: cur.map((c) => ({ kind: c.kind, hfId: c.hfId })) } })
  .catch((e) => {
    console.error("peak findMany failed", e.message);
    return [];
  });
const prevMap = new Map(prevRows.map((p) => [`${p.kind}/${p.hfId}`, p]));
const toCreate = [];
const toUpdate = [];
const alerts = [];
for (const c of cur) {
  const prev = prevMap.get(`${c.kind}/${c.hfId}`);
  if (!prev) {
    toCreate.push({ kind: c.kind, hfId: c.hfId, likes: c.likes, downloads: c.downloads });
    continue; // 首次見到只建基準線，不告警
  }
  const dlGrow = c.downloads - prev.downloads;
  const likeGrow = c.likes - prev.likes;
  const dlPct = prev.downloads > 0 ? (dlGrow / prev.downloads) * 100 : 0;
  const likePct = prev.likes > 0 ? (likeGrow / prev.likes) * 100 : 0;
  if ((dlGrow >= MIN_DL && dlPct >= PCT) || (likeGrow >= MIN_LIKES && likePct >= PCT)) {
    if (alerts.length < MAX_ALERTS) {
      const parts = [];
      if (dlGrow >= MIN_DL && dlPct >= PCT) parts.push(`⬇ +${dlGrow.toLocaleString()} (${dlPct.toFixed(0)}%)`);
      if (likeGrow >= MIN_LIKES && likePct >= PCT) parts.push(`👍 +${likeGrow} (${likePct.toFixed(0)}%)`);
      alerts.push(`🚨 **${c.hfId}** [${c.kind}] ${parts.join(" ")}`);
    }
  }
  // 峰值只升不降；沒變化就不寫
  const likes = Math.max(prev.likes, c.likes);
  const downloads = Math.max(prev.downloads, c.downloads);
  if (likes !== prev.likes || downloads !== prev.downloads) {
    toUpdate.push(
      db.peak.update({
        where: { kind_hfId: { kind: c.kind, hfId: c.hfId } },
        data: { likes, downloads },
      })
    );
  }
}
if (toCreate.length > 0) {
  await db.peak.createMany({ data: toCreate, skipDuplicates: true }).catch((e) => console.error("peak createMany failed", e.message));
}
if (toUpdate.length > 0) {
  const CHUNK = 50; // transaction 別一次塞太多
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    await db.$transaction(toUpdate.slice(i, i + CHUNK)).catch((e) => console.error("peak update chunk failed", e.message));
  }
}
console.log(`phase3 peaks: new=${toCreate.length} updated=${toUpdate.length}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (alerts.length > 0) {
  console.log(`alerts: ${alerts.length}`);
  await discord(`🤗 HF Monitor 漲幅告警\n${alerts.join("\n")}`);
}
// 歷史曲線只留 90 天，避免免費用量爆炸
const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
const pruned = await db.metricHistory.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => ({ count: 0 }));
if (pruned.count > 0) console.log(`pruned ${pruned.count} old history rows`);
console.log(`done total=${total} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await db.$disconnect();
