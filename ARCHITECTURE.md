# 架構說明 v1.0（定案）

## 需求
- 全站熱門（非指定追蹤）：models / datasets / spaces Top 100 by likes/downloads
- 技術棧不限 → 選維護成本最低：Next.js 單體 + Prisma
- 推上 GitHub，用 GitHub Actions 當免費 Cron
- Discord/Telegram：Phase 2，不進 MVP

## 決策
| 議題 | 選擇 | 理由 |
|---|---|---|
| 前後端 | Next.js 14 App Router 單體 | 一個 repo、Vercel 一鍵部署，不用管 CORS/雙服務 |
| 語言 | TypeScript | HF API 只是 REST，Python SDK 優勢不大 |
| DB | SQLite（本機）/ Postgres（上線），Prisma 切換 | MVP 零依賴，上線換 connection string 即可 |
| 排程 | scripts/collect.mjs + GitHub Actions hourly + /api/cron/collect | 免費、免 Redis/Celery |
| 圖表 | Recharts | 輕量，Top10 Bar 先行；歷史曲線 Phase 2 補 LineChart |
| 快取 | fetch next.revalidate=600 | 免 Redis，HF rate limit 靠 token + 間隔解決 |

## 資料流
1. Actions 每小時 `npm run collect` → 6 輪（3 kind × 2 sort）→ 寫 `Snapshot`（清舊寫新）+ Top20 寫 `MetricHistory`
2. `/` 先讀 `Snapshot`，無資料 fallback 即時 HF API（首屏不空白）
3. `/api/trending` 純透傳 HF（給除錯/前端擴充用）

## Phase 2 預留
- `notify()` 空介面 → 接 `DISCORD_WEBHOOK_URL` / Telegram Bot
- `MetricHistory` 已有 kind+hfId+time index → 可做 spike 偵測（downloads 日增 >30% 發事件）
- Watchlist：加 `Watch` 表 + 簡單 form 即可，不需 auth（先 localStorage 也行）

## 風險
- HF 匿名配額低 → README 要求設 `HF_TOKEN`；collector 有 3 次 backoff
- Spaces 無 downloads 欄位 → 存 0，前端顯示 `-`
