# Fin Crypto Research Backend

This backend implements the crypto-only API in `../crypto_research_buddy_contract.md`. Snapshot research uses transparent rules; separate Gemini free-tier chat requires a key and operator confirmation of an unpaid project with billing disabled. No live model call was performed during implementation/testing. No paid-provider fallback exists.

## Features
- `GET /api/v1/health`
- `GET /api/v1/assets`
- `GET /api/v1/assets/search?q=...` and `GET /api/v1/assets/{asset_id}`
- `GET /api/v1/chat/config` and `POST /api/v1/chat`
- `POST /api/v1/crypto-analysis`
- `GET /api/v1/crypto-history/{asset_id}?timeframe=1d|1w|1m|1y`
- Provider-backed canonical crypto identity validation and candidate selection; eight featured defaults, not eight-only coverage
- Qualitative profiles/context echo and attributed snapshot strengths/concerns/unknowns
- CoinGecko aggregate metrics; Coinbase Exchange USD fallback quotes/history
- Headlines via Google News RSS; no claim that full articles were read
- Parallel retrieval, pooled async HTTP, bounded deadlines and a short cache
- Missing values and coverage limitations disclosed; no hardcoded macro/volatility figures

## Run locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Then test:

```bash
curl http://localhost:8000/api/v1/health
curl -X POST http://localhost:8000/api/v1/crypto-analysis \
  -H "Content-Type: application/json" \
  -d '{"asset_id":"bitcoin","question":"What should I investigate about token supply and liquidity?"}'
curl 'http://localhost:8000/api/v1/crypto-history/bitcoin?timeframe=1w'
```

## Notes
- Optionally export `COINGECKO_DEMO_API_KEY` or `COINGECKO_PRO_API_KEY` before running. No automatic `.env` loading; never share your key in chat or browser code.
- Cache TTL: quotes 60s, news 300s, history 120–300s. Cache includes unavailable responses to prevent repeated provider hammering.
- Market HTTP requests have a 4s wall-clock limit; analysis/history have a 14s deadline. Chat has a separate 45s deadline, 30s model-call timeout, dedicated two-connection model pool and two-call admission limit.
- Export `GEMINI_API_KEY` and `GEMINI_FREE_TIER_CONFIRMED=true` only after verifying an unpaid project with billing disabled. `GEMINI_MODEL` defaults to allowlisted `gemini-3.8-flash`; non-allowlisted models are rejected. Config GET makes no hosted call. Old OpenAI keys are ignored. The code cannot inspect Google billing; do not enable billing to work around quota failures.
- `CHAT_DAILY_REQUEST_LIMIT` defaults20 attempts/process/UTC day;0 disables. Failures count, restart resets and workers are separate. Completion limit4096 tokens/no retries is a demo resource guard, not account-billing verification or a shared quota.
- Native Gemini generateContent uses header-only API key, JSON Schema output and validated source IDs. HTTP429 is quota/rate unavailable without retry/fallback. Profile sharing is disabled: any non-null `profile` or `share_profile:true` chat request is rejected. Questions/history may be used for Google product improvement/human review; do not submit personal/confidential data. Snapshot profile personalization remains available. Scope/claim support still needs real-model evaluation.
- Coinbase volume is base units, so USD volume remains null in the fallback; aggregate market cap/FDV are also unavailable there.
- Quote time is never replaced with retrieval time. Coinbase stats do not expose a quote event timestamp.
- Run `python -m pytest -q` inside backend. Tests do not make real network calls.
- Backend dependencies use compatible minimum ranges; record resolved versions for a production lockfile. This remains a research prototype, not a hardened public API.
