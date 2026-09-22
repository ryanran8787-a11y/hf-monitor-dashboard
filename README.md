# HF Monitor — Hugging Face 全站熱門儀表盤

MVP：每小時抓 HF Hub `models / datasets / spaces` 熱門榜，存快照 + 畫表。
通知（Discord / Telegram）留到 Phase 2（`src/lib/hf.ts: notify()` 已預留介面）。

## 快速開始

```bash
cp .env.example .env
npm install
npx prisma db push
npm run collect   # 抓一次資料（需網路）
npm run dev       # http://localhost:3000
```

## 架構（單體 Next.js）

```
HF Hub REST API ──> Collector (scripts/collect.mjs / POST /api/cron/collect)
                        ──> Prisma (SQLite本機 / Postgres上線)
                        ──> Next.js App Router (/, /api/trending)
```

- `src/lib/hf.ts`：HF API 封裝 + 重試，帶 `HF_TOKEN` 提高配額
- `prisma/schema.prisma`：`Snapshot` 最新榜單 + `MetricHistory` 曲線
- `.github/workflows/collect.yml`：GitHub Actions 每小時收集（免付費 Cron）
- Vercel 部署：設 `DATABASE_URL`（Postgres，如 Neon/Supabase）、`HF_TOKEN`、`CRON_SECRET`

## 推上 GitHub

```bash
git init -b main; git add -A; git commit -m "feat: hf monitor mvp"
gh repo create hf-monitor-dashboard --public --source=. --push
```

上線 DB 建議 Neon / Supabase Postgres，把 `prisma/schema.prisma` provider 換成 `postgresql` 即可。
