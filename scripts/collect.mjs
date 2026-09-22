// 本機 / CI 用收集器：node scripts/collect.mjs
// 3 kinds × 4 sorts（likes / downloads / trendingScore / lastModified）→ Snapshot + MetricHistory，
// 另做漲幅偵測（Peak 表），突破閾值且有 DISCORD_WEBHOOK_URL 就推播。
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

const kinds = ["model", "dataset", "space"];
const sorts = ["likes", "downloads", "trendingScore", "lastModified"];
const seen = new Map(); // 去重：同一 repo 只做一次 Peak 比對
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
          // 列表 API 只有 createdAt，詳情才有 lastModified
          lastModified: x.lastModified ?? x.last_modified ?? x.createdAt ?? null,
          rank: i + 1, sortBy: sort,
        })),
      });
      for (const x of items.slice(0, 20)) {
        const hfId = x.id ?? x.name;
        await db.metricHistory.create({
          data: { kind, hfId, likes: x.likes ?? 0, downloads: x.downloads ?? 0 },
        }).catch(() => {});
        if (!seen.has(`${kind}/${hfId}`)) {
          seen.set(`${kind}/${hfId}`, { kind, hfId, likes: x.likes ?? 0, downloads: x.downloads ?? 0 });
        }
      }
      total += items.length;
      console.log(`ok ${kind}/${sort} n=${items.length}`);
    } catch (e) {
      console.error(`fail ${kind}/${sort}`, e.message);
    }
  }
}

// ---- 漲幅偵測 ----
const alerts = [];
for (const cur of seen.values()) {
  try {
    const prev = await db.peak.findUnique({ where: { kind_hfId: { kind: cur.kind, hfId: cur.hfId } } });
    if (!prev) {
      await db.peak.create({ data: { kind: cur.kind, hfId: cur.hfId, likes: cur.likes, downloads: cur.downloads } });
      continue; // 首次見到只建基準線，不告警
    }
    const dlGrow = cur.downloads - prev.downloads;
    const likeGrow = cur.likes - prev.likes;
    const dlPct = prev.downloads > 0 ? (dlGrow / prev.downloads) * 100 : 0;
    const likePct = prev.likes > 0 ? (likeGrow / prev.likes) * 100 : 0;
    const hot =
      (dlGrow >= MIN_DL && dlPct >= PCT) || (likeGrow >= MIN_LIKES && likePct >= PCT);
    // 更新峰值（只升不降）
    await db.peak.update({
      where: { kind_hfId: { kind: cur.kind, hfId: cur.hfId } },
      data: { likes: Math.max(prev.likes, cur.likes), downloads: Math.max(prev.downloads, cur.downloads) },
    });
    if (hot && alerts.length < MAX_ALERTS) {
      const parts = [];
      if (dlGrow >= MIN_DL && dlPct >= PCT) parts.push(`⬇ +${dlGrow.toLocaleString()} (${dlPct.toFixed(0)}%)`);
      if (likeGrow >= MIN_LIKES && likePct >= PCT) parts.push(`👍 +${likeGrow} (${likePct.toFixed(0)}%)`);
      alerts.push(`🚨 **${cur.hfId}** [${cur.kind}] ${parts.join(" ")}`);
    }
  } catch (e) {
    console.error("peak check fail", cur.hfId, e.message);
  }
}
if (alerts.length > 0) {
  console.log(`alerts: ${alerts.length}`);
  await discord(`🤗 HF Monitor 漲幅告警\n${alerts.join("\n")}`);
}
console.log(`done total=${total}`);
await db.$disconnect();
