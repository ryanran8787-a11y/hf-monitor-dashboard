// 看門狗：檢查最新一筆 MetricHistory 是否新鮮，斷收就 Discord 喊一聲。
// 跑法：.github/workflows/watchdog.yml 每小時觸發（跟 collect 錯開分鐘數）。
// 節流：告警後 WATCHDOG_RESEND_HOURS 內不再重發，避免掛著的時候每小時洗版。
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const MAX_AGE_H = Number(process.env.WATCHDOG_MAX_AGE_HOURS ?? 3);
const RESEND_H = Number(process.env.WATCHDOG_RESEND_HOURS ?? 12);
const DISCORD = process.env.DISCORD_WEBHOOK_URL ?? "";
const REPO = process.env.GITHUB_REPOSITORY ?? "";

const fmtT = (d) =>
  new Date(d).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

async function main() {
  const latest = await db.metricHistory
    .findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } })
    .catch((e) => {
      throw new Error(`db unreachable: ${e.message}`);
    });
  const ageH = latest ? (Date.now() - new Date(latest.createdAt).getTime()) / 3600000 : Infinity;
  if (ageH <= MAX_AGE_H) {
    console.log(`ok: latest=${latest ? fmtT(latest.createdAt) : "none"} age=${ageH.toFixed(2)}h`);
    return;
  }

  const st = await db.watchdogState.upsert({
    where: { key: "collect-freshness" },
    update: {},
    create: { key: "collect-freshness" },
  });
  const sinceAlertH = st.lastAlertAt ? (Date.now() - new Date(st.lastAlertAt).getTime()) / 3600000 : Infinity;
  if (sinceAlertH < RESEND_H) {
    console.log(`stale age=${ageH.toFixed(2)}h but throttled (last alert ${sinceAlertH.toFixed(1)}h ago)`);
    return;
  }

  const latestStr = latest ? fmtT(latest.createdAt) : "（庫裡一筆都沒有）";
  const link = REPO ? `\nActions: https://github.com/${REPO}/actions` : "";
  const msg = `🚨 HF Monitor 斷收：最新資料 ${latestStr}（${ageH === Infinity ? "∞" : ageH.toFixed(1)} 小時前），超過 ${MAX_AGE_H}h 閾值。${link}`;
  if (!DISCORD) {
    console.error(`ALERT (no webhook, failing job): ${msg}`);
    process.exitCode = 1;
    return;
  }
  try {
    const r = await fetch(DISCORD, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg.slice(0, 1900) }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    console.error(`discord send failed: ${e.message}`);
    process.exitCode = 1;
    return;
  }
  await db.watchdogState.update({ where: { key: "collect-freshness" }, data: { lastAlertAt: new Date() } });
  console.log(`alerted: ${msg}`);
}

await main().finally(() => db.$disconnect());
