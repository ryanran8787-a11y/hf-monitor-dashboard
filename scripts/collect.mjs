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
  if (!DISCORD) return true;
  try {
    const r = await fetch(DISCORD, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text.slice(0, 1900) }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return true;
  } catch (e) {
    console.error("discord failed", e.message);
    return false;
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
      // 先刪後建：刪失敗就整輪跳過（避免倍增；建失敗則該榜暫空、總覽 fallback 即時 API）
      try {
        await db.snapshot.deleteMany({ where: { kind, sortBy: sort } });
      } catch (e) {
        console.error(`snapshot delete fail ${kind}/${sort}`, e.message);
        return null;
      }
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

// 去重：同一 repo 只比對一次峰值；歷史曲線則按榜單分別保留（含 rank/sortBy）
const seen = new Map();
const histRows = [];
for (const r of rounds) {
  r.items.slice(0, TOP_N).forEach((x, i) => {
    const hfId = x.id ?? x.name;
    histRows.push({ kind: r.kind, hfId, likes: x.likes ?? 0, downloads: x.downloads ?? 0, rank: i + 1, sortBy: r.sort, task: x.pipeline_tag ?? null });
    const key = `${r.kind}/${hfId}`;
    if (!seen.has(key)) {
      seen.set(key, { kind: r.kind, hfId, likes: x.likes ?? 0, downloads: x.downloads ?? 0 });
    }
  });
}

// ---- Phase 2：歷史曲線一次批量寫 ----
const cur = [...seen.values()];
await db.metricHistory.createMany({ data: histRows }).catch((e) => console.error("history createMany failed", e.message));
console.log(`phase2 history: ${histRows.length} rows, ${((Date.now() - t0) / 1000).toFixed(1)}s`);

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
// ---- Phase 4：每日摘要（台北 08:00，一天一次，用 DigestLog 去重；08 點內多輪只搶到一封）----
const taipeiHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "numeric", hour12: false }).format(new Date()));
if (taipeiHour === 8 && DISCORD) {
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  try {
    await db.digestLog.create({ data: { date: dateStr } }); // 搶到 = 今天第一個，直接發；搶輸（P2002）跳過
    // 同批可能橫跨分鐘：取最新點往前 3 分鐘內的全部當「本輪」，避免切成兩半
    const cluster = (rows) => {
      if (rows.length === 0) return [];
      const sorted = rows.slice().sort((a, b) => b.createdAt - a.createdAt);
      const cutoff = sorted[0].createdAt - 3 * 60 * 1000;
      return sorted.filter((h) => h.createdAt >= cutoff).sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99)).slice(0, 20);
    };
    const latest = await db.metricHistory.findMany({
      where: { kind: "model", sortBy: "trendingScore", createdAt: { gte: new Date(Date.now() - 2 * 3600 * 1000) } },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    const curRows = cluster(latest);
    const oldAll = await db.metricHistory.findMany({
      where: { kind: "model", sortBy: "trendingScore", createdAt: { lte: new Date(Date.now() - 24 * 3600 * 1000) } },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    const oldRows = cluster(oldAll);
    const curMap = new Map(curRows.map((h) => [h.hfId, h]));
    const oldMap = new Map(oldRows.map((h) => [h.hfId, h]));
    const newOnes = curRows.map((h) => h.hfId).filter((id) => !oldMap.has(id));
    const dropped = oldRows.map((h) => h.hfId).filter((id) => !curMap.has(id));
    const growers = curRows
      .filter((h) => oldMap.has(h.hfId))
      .map((h) => ({ hfId: h.hfId, grow: h.likes - oldMap.get(h.hfId).likes, from: oldMap.get(h.hfId).likes, to: h.likes }))
      .sort((x, y) => y.grow - x.grow)
      .slice(0, 3);
    const lines = [`📮 HF 熱榜日報 ${dateStr.slice(5).replace("-", "/")}（models）`];
    if (growers.length > 0) {
      lines.push("🔥 吸粉最快");
      growers.forEach((g, i) => lines.push(`${i + 1}. ${g.hfId} +${g.grow.toLocaleString()}（${g.from.toLocaleString()}→${g.to.toLocaleString()}）`));
    }
    if (newOnes.length > 0) lines.push(`🆕 新進榜：${newOnes.slice(0, 5).join("、")}${newOnes.length > 5 ? ` 等 ${newOnes.length} 個` : ""}`);
    if (dropped.length > 0) lines.push(`📉 掉出榜：${dropped.slice(0, 5).join("、")}${dropped.length > 5 ? ` 等 ${dropped.length} 個` : ""}`);
    await discord(lines.join("\n")).then(async (sent) => {
      if (sent) {
        console.log(`digest sent for ${dateStr}`);
      } else {
        // 發送失敗就刪掉佔位，讓 08 點內下一輪重試
        await db.digestLog.delete({ where: { date: dateStr } }).catch(() => {});
      }
    });
  } catch (e) {
    if (e?.code !== "P2002") console.error("digest failed", e.message);
  }
}

// ---- Phase 5：watch 續養（冷門追蹤模型每輪抓一次，一台一次，失敗跳過；上榜模型本來就有不重複算）----
const watched = await db.watch.findMany({ take: 50 }).catch(() => []);
if (watched.length > 0) {
  const seg = (k) => (k === "model" ? "models" : k === "dataset" ? "datasets" : "spaces");
  const wrows = [];
  let wfail = 0;
  let wfailMsg = "";
  for (let i = 0; i < watched.length; i += 5) {
    await Promise.all(
      watched.slice(i, i + 5).map(async (w) => {
        try {
          const r = await fetch(`${API}/${seg(w.kind)}/${w.hfId}`, { headers });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const x = await r.json();
          wrows.push({ kind: w.kind, hfId: w.hfId, likes: x.likes ?? 0, downloads: x.downloads ?? 0, rank: null, sortBy: "watch", task: x.pipeline_tag ?? null });
        } catch (e) {
          wfail++;
          if (!wfailMsg) wfailMsg = `${w.hfId}: ${e.message}`;
        }
      })
    );
  }
  if (wrows.length > 0) {
    await db.metricHistory.createMany({ data: wrows }).catch((e) => console.error("watch history failed", e.message));
  }
  console.log(`phase5 watch: ${wrows.length}/${watched.length} fail=${wfail}${wfailMsg ? ` e.g. ${wfailMsg}` : ""}`);
}
// 歷史曲線只留 90 天，避免免費用量爆炸
const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000);
const pruned = await db.metricHistory.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => ({ count: 0 }));
if (pruned.count > 0) console.log(`pruned ${pruned.count} old history rows`);
console.log(`done total=${total} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await db.$disconnect();
