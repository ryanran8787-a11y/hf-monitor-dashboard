# 架構說明 v1.2（2026-09-24 code review 修復：刪死路由、快照防倍增、日報 3 分鐘聚輪＋發送失敗刪佔位退重試、watch 5 併發＋失敗計數、PK 判決改重疊窗口、流派趨勢補零不斷線、補 kind+sortBy+createdAt 索引、Actions timeout 15min）

## 需求
- 全站熱門：models / datasets / spaces，分 4 榜（🔥熱門 trendingScore / 👍Likes / ⬇下載 / 🆕新動態 lastModified）
- 技術棧不限 → Next.js 單體 + Prisma + Supabase Postgres
- 推上 GitHub，用 GitHub Actions 當免費 Cron（每小時）
- Discord 漲幅告警：已上線（`DISCORD_WEBHOOK_URL`）

## 決策
| 議題 | 選擇 | 理由 |
|---|---|---|
| 前後端 | Next.js 14 App Router 單體 | 一個 repo、Vercel 一鍵部署 |
| DB | Supabase Postgres（pooler + directUrl） | Actions 持久化；本機可用 SQLite（provider 切回即可） |
| 排程 | scripts/collect.mjs + GitHub Actions hourly | 免費；Vercel Hobby cron 限每日一次故不用（`vercel.json` 已清空） |
| 圖表 | Recharts（Bar + Line 雙軸） | 輕量 |
| 快取 | fetch next.revalidate=600 | 免 Redis |

## 資料流
1. Actions 每小時 `npm run collect` → 12 輪（3 kind × 4 sort）→ `Snapshot`（清舊寫新）+ Top20 寫 `MetricHistory` + `Peak` 比對漲幅 → 超閾值 Discord 推播
2. `/` 先讀 `Snapshot`（按 kind + sortBy），無資料 fallback 即時 HF API
3. `/model/[...id]` 詳情：HF 單 repo API + `MetricHistory` 曲線（2 筆以上才畫線）
4. `/compare?kind=&a=&b=` 雙雄 PK：`MetricHistory.groupBy` 取候選（Top300 by likes）+ 兩條歷史合併時間軸（likes/downloads/熱門排名三圖＋判決卡）；選模型框是共用 `ModelPicker`，watchlist 可直接复用
5. `/` 流派分析（僅 model）：版圖吃當期熱門榜 Top50 快照按 `task` 分組；趨勢吃 `MetricHistory`（`sortBy=trendingScore`，每輪各 task likes 佔比堆疊，Top5＋其他；`task` 欄 2026-09-23 起才寫，舊輪跳過）
6. `/watch` 追蹤清單（無登入，全站一份，上限 50）：`WatchAdder` 即時搜 HF（`/api/hf-search`）→ `POST /api/watch`；collector Phase 5 每輪多抓一次（`sortBy="watch"`，失敗跳過）；`/watch` 現價＋24h 變化＋sparkline；詳情頁 `WatchToggle` 開關；取消只停更、歷史保留
7. 日報：collector Phase 4，台北 08:00（UTC 00:00）用 `DigestLog` 去重搶發，模板組裝（吸粉前3＋新進榜＋掉榜），走舊 Discord webhook
8. 深色模式：Tailwind `class` 模式＋`globals.css` 集中覆蓋（`.card/.pill/.muted/table/link`）；`ThemeProvider`（`src/lib/theme.tsx`）管狀態＋localStorage＋跟系統；layout 內嵌 paint 前腳本防閃白；五張圖表經 `chartTheme()` 換裝潢色，系列色兩邊通用
4. `MetricHistory` 只留 90 天（collector 每輪順手清）

## 已知限制
- 列表 API 不回 `lastModified`，`Updated` 欄實際吃 `createdAt`
- 累積型指標（likes/downloads）永遠偏袒老模型；看新熱門請用 🔥熱門榜
- Spaces 無 downloads 欄位 → 存 0

## 風險
- HF 匿名配額低 → 設 `HF_TOKEN`；collector 有 3 次 backoff
- 收集只走 `scripts/collect.mjs`（Actions）；腐爛分叉 `/api/cron/collect` 已刪除（2026-09-24：歷史缺 rank/sortBy/task 且 250+ RTT 必超時）
