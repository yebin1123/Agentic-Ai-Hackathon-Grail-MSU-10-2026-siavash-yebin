# Fin • Crypto Research Buddy

A crypto-only market research dashboard with an animated dolphin companion, provider-attributed metrics, question-specific snapshot answers, and independent **1D / 1W / 1M / 1Y** USD charts.

**Two distinct modes:** snapshot research remains rule-based, with metric-specific answers and limitations. Separate Gemini free-tier chat can explain directly-crypto questions when an operator configures a free API key and confirms an unpaid project with billing disabled. No paid-provider fallback exists. No template is mislabeled AI. General explanations use model knowledge; current claims should use supplied snapshot/headline evidence. Headlines are not full articles. It never trades, certifies suitability or promises returns. Live model quality and scope behavior have not been evaluated yet.

## Research-question cleanup

Submitted questions are now visible above topic-specific answers, rather than hidden in a collapsed dropdown. Cards distinguish snapshot evidence, partial evidence and unconnected topics, with limitations beside each answer. The old fixed overview paragraph and duplicate key-point panel are not used for structured responses. Editing a draft does not rerun research: press **Resubmit question**. Completed questions and results are stored together so a later draft cannot relabel a previous answer. Update frontend and backend together; an older backend shows a coverage notice instead of pretending to provide topic-by-topic answers.

## Personalized research, broader search and crypto chat

- Optional qualitative profile: experience, research goal/horizon, loss willingness, ability to absorb losses, liquidity needs, interests and explanation detail. Tailored notes prioritize research questions, not trades or allocations. There is no validated suitability/risk score.
- Preferences are saved only with **Remember preferences in this browser** checked. Reset removes stored preferences. No account, wallet connection, income amounts or financial credentials are needed.
- Hosted profile sharing is disabled for Gemini free tier: saved names and risk/financial profiles are never sent by the integration. Profiles still tailor snapshot panels locally/on our backend. Do not put personal or confidential data in questions: free-tier prompts/responses may be used for Google product improvement and human review; regional terms differ. Questions and selected prior messages go to Gemini, and clearing local history cannot delete provider data. History is page-memory only and excludes mismatched asset or previously profile-shared context.
- Search goes beyond the eight featured coins via CoinGecko. Select candidates by canonical ID; full detail shows available chain/contracts. Coverage is not literally every crypto. DEX-only token support is proposed, not implemented.
- Potential strengths, concerns and unknowns use attributable snapshot values and source IDs. Lists vary with the asset/data and can be empty; these are limited research signals, not a comprehensive project thesis.

## Team

Yebin — frontend and integration. Siavash — original backend. Developed with Grail coding-agent assistance following the MSU hackathon prototype.

## Run locally (Mac / IntelliJ)

Requirements: Python 3.11+ and Node **20.19+ or 22.12+** (a current Node LTS is recommended). Open two terminals from this project root.

### Terminal 1 — backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Optional: before starting Uvicorn, export `COINGECKO_DEMO_API_KEY` or `COINGECKO_PRO_API_KEY` in this terminal. Keep keys outside browser code and Git. The app reads exported environment variables; it does **not** automatically load a `.env` file.

### Enable Gemini free-tier chat (optional)

1. Open https://aistudio.google.com/api-keys and create an API key for an **unpaid project with billing disabled**. Region/account/free-model availability and quotas vary. Do not upgrade to paid billing to bypass a quota error.
2. Add `GEMINI_API_KEY` to the backend environment through local terminal/IDE settings. Never paste the secret in chat, frontend code or Git.
3. Set `GEMINI_FREE_TIER_CONFIRMED=true` **only after checking that the project has billing disabled**. The app cannot inspect Google project billing; this is an operator declaration, not automatic proof of zero cost.
4. Restart the backend, then click **Retry configuration** in the chat panel.

Current allowlisted/default model: `gemini-3.8-flash`, listed with free input/output on Google's pricing page when checked 2026-10-28. Optional `GEMINI_MODEL` may only select an allowlisted free model. Unsupported/paid models are rejected; there is no paid OpenAI fallback. Availability can change, and a billing-enabled project could incur charges even for the same model. Keep billing disabled to use unpaid quotas.

Non-secret backend settings:

```bash
export GEMINI_FREE_TIER_CONFIRMED=true
export CHAT_DAILY_REQUEST_LIMIT=20
```

The application does not automatically load `.env`; variables must be exported or injected into the backend process.

`CHAT_DAILY_REQUEST_LIMIT` defaults to **20 attempted calls/process/UTC day**;0 disables. Completion limit4096 tokens, one native Gemini call per request, no retries/tools/paid fallback. Failures count; restarts reset and workers have separate counters. Google's request/token quotas are additional limits. HTTP429 shows an actionable quota/rate-limit message, not a billing upgrade. The demo guard does not verify account billing or enforce a distributed quota.

**Retry configuration** checks settings only, not live connectivity. Tests make no live model calls. Evaluate crypto/non-crypto/mixed questions, source support, uncertainty and latency after setup. Read Google's pricing and unpaid-data terms: https://ai.google.dev/gemini-api/docs/pricing and https://ai.google.dev/gemini-api/terms. If you need private personalized chat or cannot obtain unpaid quota, a locally running model is a future alternative, not implemented here.

### Terminal 2 — frontend

```bash
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173** (or the port Vite prints). Health: http://localhost:8000/api/v1/health. API docs: http://localhost:8000/docs.

## Test

From backend with its virtual environment active: `python -m pytest -q`. From frontend: `npm test` and `npm run build`. Backend tests use synthetic fixtures and no public network.

## Architecture

- React / TypeScript / CSS / Vite frontend, native SVG charts and mascot, opt-in profiles, debounced candidate search and separate session chat; no chart SDK.
- FastAPI / Pydantic / HTTPX backend with asynchronous parallel retrieval, pooled HTTP connections, wall-clock deadlines and a short per-process cache.
- CoinGecko: aggregated crypto quote, supply, cap, FDV and history. Optional Demo/Pro key support.
- Coinbase Exchange: USD single-market fallback quotes and completed candles. No USDT quote is mislabeled as USD; fallback cannot supply aggregate market cap/FDV or global USD volume.
- Google News RSS: recent crypto headline discovery with original publisher and dates; not full-article retrieval.
- Featured canonical assets: BTC, ETH, SOL, LINK, AVAX, DOGE, ADA, XRP. Other CoinGecko assets resolve through provider-backed identity search/detail; Coinbase fallback only uses the eight explicit verified mappings, never a guessed ticker pair.
- Hosted chat uses a separate two-connection pool and two-call admission limit so slow models do not exhaust market-data connections. Model scope decisions and citation-ID validation are not guarantees of truth or injection resistance.

See `crypto_research_buddy_contract.md` for the updated API and metric definitions. The old stock endpoint returns 410. Deployments need a same-origin `/api` reverse proxy, abuse controls and provider-tier review; Vite's development proxy is not included in a static production build.

## Known limitations

No production authentication, distributed quota, personalized allocation/suitability engine, primary-document retrieval, full-article news synthesis, DEX-only asset lookup, on-chain analytics, real-time streaming, unlock calendar, order-book depth, wallet integration or background alerts. DefiLlama, DEX Screener, GoPlus, Moralis and Alchemy are researched options, not connected in this release. Hosted chat code is implemented but no live model call was performed. Data access depends on provider/network availability. One-year history may require a paid CoinGecko tier or use Coinbase fallback; incomplete coverage is disclosed. Volume and FDV are provider reports, not proof of liquidity or intrinsic value. Historical drawdown uses returned samples and can understate intraperiod loss. Realized volatility is proposed, not implemented.
