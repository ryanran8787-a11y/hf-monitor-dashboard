# HF Monitor — Hugging Face 全站熱門儀表盤

每小時抓 HF Hub `models / datasets / spaces` 四榜（🔥熱門 / 👍Likes / ⬇下載 / 🆕新動態），存快照 + 畫表 + 漲幅 Discord 告警。

## 快速開始

```bash
cp .env.example .env   # 填 Supabase 兩條 URL + HF_TOKEN（本機也可用 SQLite）
npm install
npx prisma db push
npm run collect   # 抓一次資料（需網路）
npm run dev       # http://localhost:3000
```

## 架構（單體 Next.js）

```
HF Hub REST API ──> Collector (scripts/collect.mjs，唯一寫入路徑）
                        ──> Prisma (SQLite本機 / Postgres上線)
                        ──> Next.js App Router (/, /api/trending)
```

- `src/lib/hf.ts`：HF API 封裝（likes/downloads/lastModified/trendingScore 四排序），帶 `HF_TOKEN` 提高配額
- `prisma/schema.prisma`：`Snapshot` 最新榜單 + `MetricHistory` 曲線（90 天）+ `Peak` 漲幅基準
- `.github/workflows/collect.yml`：GitHub Actions 每小時收集（免付費 Cron）
- `scripts/collect.mjs`：收集 + 漲幅偵測，超閾值經 `DISCORD_WEBHOOK_URL` 推播
- Vercel 部署：設 `DATABASE_URL`、`DIRECT_URL`、`HF_TOKEN`（`DISCORD_WEBHOOK_URL` 可選）

## 推上 GitHub

```bash
git init -b main; git add -A; git commit -m "feat: hf monitor mvp"
gh repo create hf-monitor-dashboard --public --source=. --push
```

上線 DB 建議 Neon / Supabase Postgres，把 `prisma/schema.prisma` provider 換成 `postgresql` 即可。
