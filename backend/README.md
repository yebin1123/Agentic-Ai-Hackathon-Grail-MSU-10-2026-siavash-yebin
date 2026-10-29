# Fin backend

A FastAPI service that gathers crypto market data and serves it to the frontend. The API contract is in [`../crypto_research_buddy_contract.md`](../crypto_research_buddy_contract.md).

## Endpoints

All under `/api/v1`.

| Method and path | What it does |
|---|---|
| `GET /health` | Liveness check |
| `GET /assets` | The eight featured coins |
| `GET /assets/search?q=` | Search CoinGecko for candidates |
| `GET /assets/{id}` | Full identity for one coin, including chains and contracts |
| `POST /crypto-analysis` | Snapshot, topic answers, risks, sources and notes for a coin and question |
| `GET /crypto-history/{id}?timeframe=1d\|1w\|1m\|1y` | USD price history with coverage info, period change and max drawdown |
| `GET /chat/config`, `POST /chat` | The optional Gemini chat |

Errors always come back as `{"error": {"code", "message", "request_id"}}`. The old `/stock-analysis` route returns 410.

## Layout

`routes` (HTTP) → `schemas` (Pydantic) → `services` (logic) → `tools` (data providers). `tools/crypto_data.py` talks to CoinGecko, Coinbase Exchange and Google News RSS. `services/crypto_research.py` builds the rule-based answers, and `services/crypto_chat.py` is the only code that calls Gemini.

## Run it

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --port 8000
```

```bash
curl localhost:8000/api/v1/health
curl 'localhost:8000/api/v1/crypto-history/bitcoin?timeframe=1w'
curl -X POST localhost:8000/api/v1/crypto-analysis -H "Content-Type: application/json" \
  -d '{"asset_id":"bitcoin","question":"What should I check about supply and liquidity?"}'
```

Tests: `python -m pytest -q`. They never touch the network, because a fixture blocks every real HTTP transport.

## Configuration

The app reads environment variables only. It doesn't load `.env` files. A template is in `.env.example`.

| Variable | Purpose |
|---|---|
| `COINGECKO_DEMO_API_KEY`, `COINGECKO_PRO_API_KEY` | Optional CoinGecko keys (Pro wins if both are set) |
| `FRONTEND_ORIGINS` | Comma-separated CORS origins (defaults to the local dev server) |
| `GEMINI_API_KEY` | Enables the chat, together with the next variable |
| `GEMINI_FREE_TIER_CONFIRMED` | Must be exactly `true`. It's my declaration that the project is unpaid with billing off. The code can't check that. |
| `GEMINI_MODEL` | Must be on the allowlist (`gemini-3.8-flash`) |
| `CHAT_DAILY_REQUEST_LIMIT` | Model calls per process per UTC day. Default 20, and 0 or an invalid value disables the chat. |

## How it behaves

- **Caching:** quotes 60s, news 300s, history 120 to 300s. Concurrent requests for the same key share one provider call. The cache holds at most 128 entries.
- **Deadlines:** each provider request has 4 seconds, and analysis and history have 14. The chat has 45 seconds overall.
- **Providers:** CoinGecko is primary. Coinbase Exchange is a fallback for the eight featured coins only, using a hand-written ID map instead of guessing from tickers. The fallback has no market cap, FDV or USD volume, and the response says so.
- **Honesty about data:** quote times are never replaced with retrieval times. News is headlines only, and the app doesn't claim to have read the articles.

## The chat

One Gemini call per question, with these safeguards:

- strict JSON schema output
- every cited source ID must exist in the evidence I retrieved
- no tools, and no URL fetching
- the API key is checked against the context and the output
- user text and history are treated as data, not instructions
- two concurrent calls at most, and a daily cap
- the research profile is never accepted. Any request that includes one is rejected.

Limits: a citation proves the source exists, not that it supports the claim, and I haven't run the chat against a live model yet. The daily cap resets on restart and isn't shared across workers. Free-tier prompts may be used by Google to improve its products, so don't send personal data.
