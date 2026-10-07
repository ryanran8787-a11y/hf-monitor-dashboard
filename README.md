# HF Monitor — Hugging Face trending dashboard

🌐 Live demo: https://hf-monitor-dashboard.vercel.app

Tracks trending activity across Hugging Face every hour: Models / Datasets / Spaces × Trending / Likes / Downloads / New — 12 rounds in total. With history curves, head-to-head compare, genre analysis, a watchlist, and Discord spike alerts.

## Features

- **Overview boards** — three categories × four leaderboards with live ranks, likes, downloads, and update times; reads from DB snapshots, falls back to the live HF API on failure
- **Repo details** — 7-day likes / downloads / rank curves, tags, link back to HF
- **Head-to-head** — pick any two repos, compare 7-day growth and rank movement, get an automatic verdict
- **Genre analysis** — group the trending board by `pipeline_tag`: seat map plus per-genre share trends indexed to day one (=100, direction only)
- **Watchlist** — no login needed. Watched repos get their curves fed every round (max 50)
- **Daily digest** — top 3 growers, new entries, and drop-offs pushed to Discord at 08:00 Taipei time
- **Spike alerts** — downloads delta ≥ 5000 with ≥ 30% growth, or likes delta ≥ 100 with ≥ 30% growth, pushed instantly
- **Watchdog** — hourly freshness check. Yells on Discord after 3h without fresh data (no repeat within 12h). No babysitting required
- **Dark mode** — follows the system, manually switchable
- **Mobile** — responsive tables with horizontal scroll, loading skeletons, one-tap retry
- **About page** — `/welcome` showcase (hero, highlights, live numbers) for the curious

## Stack

Next.js 14 (App Router) · Prisma · Postgres (Supabase) · Recharts · Tailwind CSS · GitHub Actions (hourly collection) · Vercel (hosting)

## Quick start (local)

```bash
npm install
npx prisma db push   # SQLite by default, zero setup
npm run collect      # fetch one round of data (needs network)
npm run dev          # http://localhost:3000
```

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Postgres connection (Supabase 6543 pooler); locally `file:./dev.db` works |
| `DIRECT_URL` | ✅ on prod | Direct connection for `prisma db push` (Supabase 5432) |
| `HF_TOKEN` | Recommended | Hugging Face token, raises API quota. Works without it |
| `DISCORD_WEBHOOK_URL` | Optional | Spike alerts + daily digest + watchdog. Silent when empty |
| `SPIKE_MIN_DL` / `SPIKE_MIN_LIKES` / `SPIKE_PCT` | Optional | Alert thresholds, defaults `5000` / `100` / `30` |
| `WATCHDOG_MAX_AGE_HOURS` / `WATCHDOG_RESEND_HOURS` | Optional | Staleness threshold / resend interval, defaults `3` / `12` (hours) |

See `.env.example` for a full sample.

## Deploying online

1. Create a Postgres database on [Supabase](https://supabase.com/), grab the pooler (`6543`) and direct (`5432`) connection strings
2. Fork this repo, import it into Vercel, set the env vars above, deploy
3. In repo Settings → Secrets set `DATABASE_URL`, `DIRECT_URL`, `HF_TOKEN` (plus optional `DISCORD_WEBHOOK_URL`). GitHub Actions then collects into the DB every hour
4. (Optional) GitHub scheduling sometimes lags. Add [cron-job.org](https://cron-job.org/) hourly `POST` triggers on `actions/workflows/collect.yml/dispatches` and `actions/workflows/watchdog.yml/dispatches` as backup (body is `{"ref":"main"}` for both)

## Data notes

- Top 100 per board, Top 20 written to history; history curves kept for 30 days (all charts use the 7-day window, steady state ≈ 180K rows)
- All times shown in Taipei time (`Asia/Taipei`), stored as UTC
- Spaces have no download count in the HF API, stored as 0
- Likes / downloads are cumulative metrics that favor old repos. For fresh faces, check the 🔥 Trending board

## Project layout

```
scripts/collect.mjs        hourly collector (12 boards + alerts + digest + watchlist feeding)
scripts/watchdog.mjs       hourly watchdog (staleness alerts)
src/lib/hf.ts              HF Hub API wrapper
src/lib/absMerge.ts        shared same-minute merge across boards (likes first)
src/app/page.tsx           overview + genre analysis
src/app/compare/page.tsx   head-to-head
src/app/watch/page.tsx     watchlist
src/app/model/[...id]/     repo details
src/app/welcome/page.tsx   showcase page
src/app/loading.tsx        global loading skeleton
src/app/error.tsx          global error boundary (one-tap retry)
src/app/api/               trending / watch / hf-search
prisma/schema.prisma       Snapshot (latest boards) + MetricHistory (curves) + Peak / Watch / DigestLog / WatchdogState
```
