# Fin • Crypto Research Buddy

[![CI](https://github.com/yebin1123/Agentic-Ai-Hackathon-Grail-MSU-10-2026-siavash-yebin/actions/workflows/ci.yml/badge.svg)](https://github.com/yebin1123/Agentic-Ai-Hackathon-Grail-MSU-10-2026-siavash-yebin/actions/workflows/ci.yml)

Fin is a crypto research dashboard. You pick a coin, ask a question, and get back live market data, price charts, risks and linked sources. It never trades and doesn't give advice.

It started as a two-person hackathon project, and I've kept building it since.

## What it does

- Search any coin CoinGecko lists, or pick from eight featured ones.
- Shows a market snapshot: price, 24h change, market cap, FDV, supply, volume and all-time high. Every value is labeled with its provider and timestamp, and missing data shows as "Unavailable" instead of zero.
- Draws 1D, 1W, 1M and 1Y price charts as hand-written SVG, with an accessible data table behind them.
- Answers your question from the snapshot data, lists the risks, and links recent headlines to their original publishers.
- Takes an optional research profile (experience, goals, horizon) to tailor the notes. It's saved in your browser only if you opt in.
- Has an optional Gemini chat, which is off by default.

## Stack

| | |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Python, FastAPI, Pydantic, async HTTPX |
| Data | CoinGecko, with Coinbase Exchange as a fallback; Google News RSS for headlines |
| AI (optional) | Gemini free tier |
| Tooling | pytest, Node test runner, oxlint, GitHub Actions |

## How it works

- **The research answers are rule-based, not AI.** In a finance tool I didn't want invented numbers, so the cards only show what the data providers reported. The AI chat is separate and labeled.
- **The chat treats the model as untrusted.** It uses a strict JSON schema, rejects any citation that isn't in the evidence I retrieved, has no tools, stays disabled unless a key and an explicit free-tier confirmation are set, and has a daily call cap. It never receives the research profile.
- **Free APIs fail, so I plan for it.** Responses are cached with a lock per key (so concurrent requests share one fetch), every provider call has a hard deadline, and Coinbase covers the featured coins if CoinGecko is down.
- **The frontend ignores stale responses.** Requests are cancellable and versioned, so a slow old response can't overwrite a newer one.

The full walkthrough, with a diagram and the tradeoffs, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it

You need Python 3.11+ and Node 20.19+ (or 22.12+).

```bash
# backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --port 8000

# frontend, in a second terminal
cd frontend
npm ci
npm run dev        # http://localhost:5173
```

The dev server proxies `/api` to the backend. API docs are at http://localhost:8000/docs.

To turn on the chat, set `GEMINI_API_KEY` and `GEMINI_FREE_TIER_CONFIRMED=true` in the backend's environment. The details and the safeguards are in [backend/README.md](backend/README.md). To host the app, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Tests

- **Backend:** `python -m pytest -q` from `backend/`. 244 tests, and none of them touch the network.
- **Frontend:** `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` from `frontend/`. 56 tests.
- **CI:** GitHub Actions runs all of the above on every pull request, and `main` requires it to pass.

## Limitations

- Nothing is stored on the server, and the cache and chat limit are per process.
- There's no per-user rate limiting or login.
- The topic matching for answers is keyword-based, so it can miss unusual phrasing.
- I haven't run the Gemini chat against a live model yet, so its scope and citation behavior are untested beyond mocks.
- DEX-only tokens and on-chain data aren't covered.

My list of what I'd do next is in [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md).

## Credits

Siavash and I built this at the Agentic AI Hackathon (Grail / MSU, October 2026). He wrote the original backend prototype and I built the frontend and the integration. Since then I've reworked it into a crypto-only app and added the tests, CI and tooling. The commit history shows who did what.

I use AI coding assistance (Claude Code) on this project. I review the changes and I'm responsible for the code.

## License

[MIT](LICENSE)
