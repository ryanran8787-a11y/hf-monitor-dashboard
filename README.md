# HF Monitor — Hugging Face 全站熱門儀表盤

🌐 線上體驗：https://hf-monitor-dashboard.vercel.app

每小時追蹤 Hugging Face 全站熱門動態：Models / Datasets / Spaces 三大類 × 熱門 / Likes / 下載 / 新動態四種榜單，共 12 輪。附歷史曲線、雙雄 PK、流派分析、追蹤清單與 Discord 漲幅告警。

## 功能

- **總覽榜單** — 三類別 × 四榜單即時排名，附 Likes / 下載 / 更新時間；DB 有快照就用快照，斷線自動 fallback 即時 API
- **模型詳情** — 7 天 Likes / 下載 / 排名曲線、tags、連回 HF 主站
- **雙雄 PK** — 任選兩台對比近 7 天成長與排名變化，自動給出判決
- **流派分析** — 熱門榜按 `pipeline_tag` 分組：席次版圖＋各流派 likes 佔比趨勢
- **追蹤清單** — 無需登入，加入關注的模型後每輪自動續養曲線（上限 50）
- **每日日報** — 台北時間 08:00 推播吸粉前三、新進榜、掉榜到 Discord
- **漲幅告警** — 下載增量 ≥ 5000 且漲幅 ≥ 30%，或 likes 增量 ≥ 100 且漲幅 ≥ 30%，即時推播
- **看門狗** — 每小時檢查資料新鮮度，斷收超過 3 小時自動 Discord 告警（12 小時內不重發），站掛了不用人盯
- **深色模式** — 跟隨系統，可手動切換

## 技術棧

Next.js 14 (App Router) · Prisma · Postgres (Supabase) · Recharts · Tailwind CSS · GitHub Actions (每小時收集) · Vercel (部署)

## 快速開始（本機）

```bash
npm install
npx prisma db push   # 預設 SQLite，零設定
npm run collect      # 抓一次資料（需網路）
npm run dev          # http://localhost:3000
```

## 環境變數

| 變數 | 必填 | 說明 |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres 連線（Supabase 6543 pooler）；本機可用 `file:./dev.db` |
| `DIRECT_URL` | 上線 ✅ | `prisma db push` 專用直連（Supabase 5432） |
| `HF_TOKEN` | 推薦 | Hugging Face token，提高 API 配額，未設也能跑 |
| `DISCORD_WEBHOOK_URL` | 可選 | 漲幅告警＋每日日報推播，不填就靜默 |
| `SPIKE_MIN_DL` / `SPIKE_MIN_LIKES` / `SPIKE_PCT` | 可選 | 告警閾值，預設 `5000` / `100` / `30` |

完整範例見 `.env.example`。

## 部署到線上

1. 在 [Supabase](https://supabase.com/) 建一個 Postgres 資料庫，拿到 pooler (`6543`) 與直連 (`5432`) 兩條連線字串
2. Fork 本專案，用 Vercel 匯入，設定上面四個環境變數後部署
3. 在 repo 的 Settings → Secrets 設定 `DATABASE_URL`、`DIRECT_URL`、`HF_TOKEN`（及可選的 `DISCORD_WEBHOOK_URL`），GitHub Actions 會每小時自動收集寫庫
4. （可選）GitHub 排程偶爾延遲，可再用 [cron-job.org](https://cron-job.org/) 每小時 `POST` 觸發 `actions/workflows/collect.yml/dispatches` 當保險

## 資料說明

- 每榜抓前 100 名，前 20 名寫入歷史；歷史曲線保留 90 天
- 所有時間顯示為台北時間（`Asia/Taipei`），資料庫存 UTC
- Spaces 在 HF API 沒有下載數，統一記為 0
- Likes / 下載是累積型指標，天然偏袒老模型；想挖新秀請看 🔥 熱門榜

## 專案結構

```
scripts/collect.mjs        每小時收集器（12 輪榜單＋告警＋日報＋追蹤續養）
src/lib/hf.ts              HF Hub API 封裝
src/app/page.tsx           總覽＋流派分析
src/app/compare/page.tsx   雙雄 PK
src/app/watch/page.tsx     追蹤清單
src/app/model/[...id]/     模型詳情
src/app/api/               trending / watch / hf-search 三個 API
prisma/schema.prisma       Snapshot（最新榜單）＋ MetricHistory（曲線）＋ Peak / Watch / DigestLog
```
