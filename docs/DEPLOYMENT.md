# Deployment: Vercel (frontend) + Render (backend)

The frontend calls relative `/api/...` paths. In development, Vite proxies them to `localhost:8000`. In production, **Vercel forwards `/api/*` to the Render backend** (`frontend/vercel.json`), so the browser only ever talks to one origin and CORS is not involved.

```
Browser ──► Vercel (static React app)
              └── /api/*  ──rewrite──►  Render (FastAPI)  ──► CoinGecko / Coinbase / Google News
```

## 1. Deploy the backend on Render

1. Sign in at https://render.com with GitHub.
2. **New → Blueprint**, pick this repo. Render reads `render.yaml` and proposes a free web service named `fin-crypto-api`. Approve it.
3. Wait for the first deploy. Then open `https://<your-service>.onrender.com/api/v1/health`; it should return `{"status":"ok"}`.
4. Note the exact URL Render gave you. If it is not `https://fin-crypto-api.onrender.com` (the name may be taken), edit the `destination` in `frontend/vercel.json` to match and commit that change.

Do **not** set `GEMINI_API_KEY` for a public site unless you want the chat enabled (see below).

## 2. Deploy the frontend on Vercel

1. Sign in at https://vercel.com with GitHub.
2. **Add New → Project**, pick this repo.
3. Set **Root Directory** to `frontend`. Vercel detects Vite (build `npm run build`, output `dist`).
4. Deploy. Open the URL, pick an asset and run an analysis.

## 3. Check it works

- The page loads and the asset list fills in (this proves the `/api` rewrite works).
- An analysis returns a snapshot and a chart.
- The chat panel says chat is unavailable. That is expected without a key.

## Things to know

- **Cold starts.** Render's free plan sleeps after about 15 minutes idle. The first request after that can take 30 seconds or more. If the page shows an error on first load, retry. Warn viewers or ping the health URL before showing the site to someone.
- **Rate limits.** CoinGecko's free tier limits requests, and the cache is per process. Heavy use can show provider-unavailable messages. That is a known limitation (see `IMPROVEMENTS.md`).
- **No abuse protection.** There is no per-IP rate limiting yet, which is why the chat stays off for a public site.
- **Enabling chat later.** In Render's dashboard add `GEMINI_API_KEY` and `GEMINI_FREE_TIER_CONFIRMED=true` (only for an unpaid project with billing disabled). The daily cap (`CHAT_DAILY_REQUEST_LIMIT`, default 20) is per process and resets on restart.
- **Not covered here.** No custom domain, no monitoring, no database.
