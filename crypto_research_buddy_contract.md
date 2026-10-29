# Fin — Crypto Research Buddy contract (v0.5)

## Scope and truthfulness

Crypto-only research dashboard with optional qualitative snapshot personalization and separate Gemini free-tier chat. No stocks, trading, brokerage credentials, portfolio allocation or suitability engine. Snapshot responses are rule-based. Chat requires a free API key and explicit operator confirmation of an unpaid project with billing disabled; no paid-provider fallback exists. Model knowledge is distinct from retrieved evidence; headlines are not full articles. Hosted profiles are disabled for unpaid-service privacy. No live model behavior has been evaluated yet.

Backend owns provider/model calls and credentials. Frontend never calls market/model APIs directly. Asset identities use canonical CoinGecko IDs, not inferred tickers. BTC, ETH, SOL, LINK, AVAX, DOGE, ADA and XRP remain featured defaults; other provider-covered assets are searchable/resolvable. Native/wrapped/bridged identities and contracts must not be silently merged. No provider or this release guarantees every token has reliable data; DEX-only contract lookup is not implemented.

## Endpoints

`GET /api/v1/health` → `{ "status": "ok" }`.

`GET /api/v1/assets` → `{ "assets": [{ "id": "bitcoin", "symbol": "BTC", "name": "Bitcoin", "category": "Monetary network" }] }`.

`GET /api/v1/assets/search?q=...` accepts trimmed query2–100 characters, returns up to20 `{assets,warnings}` candidates using CoinGecko search. No candidate is automatically selected. `GET /api/v1/assets/{asset_id}` returns `{asset}` with provider-backed identity metadata. Asset also includes `platforms` (chain-to-contract map, possibly empty) and optional `provider_url`. Empty/null/malformed contract metadata is omitted, not guessed. Invalid/unknown IDs differ from resolution outages.

`POST /api/v1/crypto-analysis` request:

```json
{"asset_id":"bitcoin","question":"What should I examine about supply, liquidity and adoption?"}
```

Asset/question fields are trimmed and required; question is1–1000 characters. Optional `profile` uses the explicitly defined qualitative fields below. Other request fields are rejected rather than silently ignoring investor preferences.

Response includes `request_id`, `asset`, `analysis_mode: "deterministic"`, `submitted_question` (trimmed request echo), `answer`, `answer_sections`, `market_snapshot`, `key_points`, `risks`, `sources`, and `meta`.

Additional response fields: `applied_profile` (null or full submitted context), `personalized_notes:[{title,detail}]` and `pros_cons:{pros,cons,unknowns}`. Each argument is `{title,detail,source_ids,interpretation}`. Source IDs identify actual response sources; sourced snapshot arguments use `market`. No arbitrary fixed number of strengths/concerns is required. Current arguments are limited snapshot-derived research signals, not comprehensive project fundamentals. Personalized notes do not change market facts or certify suitability.

Snapshot-profile fields/defaults: `display_name` (max40, default empty); `experience:beginner|intermediate|advanced` (beginner); `goal:learn|long_term_research|trading_risk` (learn); `horizon:short|medium|long` (long); `loss_tolerance:low|medium|high` (low); `loss_capacity:low|medium|high|unknown` (unknown); `liquidity_need:soon|flexible|unknown` (unknown); `explanation:concise|detailed` (concise); `interests` (up to6 of defi/infrastructure/security/payments/stablecoins/memecoins, default empty). Willingness and capacity remain separate; no validated numeric risk/suitability score is inferred. These fields are not supplied to Gemini free chat; notes are research priorities rather than a generated personalized thesis.

`answer_sections`: `{topic,title,answer,status,limitation}`. Status is `answered` for available price/change snapshot evidence, `limited` for incomplete data or proxy-only evidence, and `unsupported` for unconnected requested topics. Status is evidence coverage, not a confidence score or guarantee the entire question was understood. Each recognized topic occurs once. Missing requested values are labeled unavailable; unsupported questions do not become generic market overviews just because a quote exists. `answer` joins sections and limitations as plain text for compatibility. `key_points` mirrors section content for older clients; the new UI does not repeat it. No markdown or model-generated content is rendered.

Supported metric topics: price/24h change, reported volume and supply/valuation. Risk sections explain evidence gaps, not asset-specific scores. Explicit unconnected sections cover forecasts, price-move causes, adoption/fundamentals, audits/custody, regulation, longer-period analysis, comparisons and verified unlock dates. Analysis does not receive chart observations and must not claim chart-derived results. Unmatched questions receive a capability explanation. Topic matching may miss negation, ambiguity and unrecognized subquestions.

`market_snapshot` fields:
- `price_usd`, `change_24h_percent`: latest available quote and explicitly 24h change.
- `market_cap_usd`, `fully_diluted_valuation_usd`, `circulating_supply`, `max_supply`: provider supply/valuation figures. Null max supply does not necessarily mean unlimited supply.
- `volume_24h_usd`, `volume_scope`: reported volume and scope. Coinbase stats provide base-unit volume, so the fallback does NOT invent a USD volume or mix it with CoinGecko aggregates.
- `high_24h_usd`, `low_24h_usd`, `ath_change_percent`: reported price context.
- `source`, `source_url`, `as_of`, `retrieved_at`: provenance and quote time vs retrieval time. If quote event time is unknown, `as_of` remains null.

All metrics are nullable. Price change is NOT volatility; no fake volatility metric is returned. Macro context, token unlocks, on-chain usage and order-book depth are not currently retrieved.

`key_points`: `{category,title,detail}`. `risks`: `{title,detail,severity}`; educational checklist uses `unknown`, not invented asset-specific severity. `sources`: `{source_id,title,url,publisher,published_at,source_type}`; actual retrieved headline links or provider pages only. Google RSS is a discovery source, not a claim that the full articles were read. `meta`: `{generated_at,data_as_of,warnings}`.

## Hosted crypto chat

`GET /api/v1/chat/config` returns `{enabled,provider:"gemini",model,max_question_chars:2000,profile_sharing:"disabled_free_tier"}`. This checks local configuration only, not Google project billing, connectivity, availability, remaining quota or model quality.

`POST /api/v1/chat`: `{question,asset_id?,share_profile:false,messages:[]}`. Question1–2000 trimmed characters; optional canonical asset ID; history up to12 user/assistant messages, each1–4000 characters; history+question at most16000 characters. System roles/extra fields rejected. Any non-null `profile` or `share_profile:true` is rejected with400, including stale clients. There is no server-persisted conversation; caller supplies bounded history. Conceptual questions need not select an asset.

Response: `{status:"answered"|"out_of_scope"|"unavailable",answer,citations:[{source_id,title,url}],limitations,model,profile_applied:false}`. Answer max8000 model-output characters. With selected asset, retrieval supplies identity/snapshot and headline-only evidence; no arbitrary URL, wallet, execution or article-body tools exist. Scope instructions permit crypto and directly relevant macro/regulation only; mixed prompts should address only their crypto portion. Out-of-scope output gets a fixed decline. General explanations can use model knowledge but cannot claim verified current facts without evidence.

One native Gemini `generateContent` call to the fixed Google API host, header-only key authentication, JSON Schema output, completion cap4096 tokens, no tools/redirects/retries/paid fallback. Native candidates must complete withSTOP and text-only non-thought output; safety blocks, malformed output and unknown citations become unavailable. These checks do NOT verify claim entailment, causality, semantic scope or injection resistance. Live evaluation remains required. HTTP429 returns an explicit quota/rate message; access errors never suggest enabling paid billing.

`GEMINI_API_KEY` and `GEMINI_FREE_TIER_CONFIRMED=true` are required. Confirmation declares an unpaid project with billing disabled; the app cannot inspect Google billing or guarantee zero cost under incorrect setup. `GEMINI_MODEL` defaults to allowlisted `gemini-3.8-flash`, listed with free input/output when checked2026-10-28. Other models are rejected until their free access is verified and the allowlist updated. Old OpenAI keys are ignored. Provider tiers, regions and quotas may change.

Unpaid Google terms permit product improvement and human review of prompts/responses, with regional differences. Do not send personal/sensitive/confidential data. Integration strips/rejects stored profile data; it cannot prevent a user manually typing personal details into questions/history. Keep local snapshot personalization separate. Official terms: https://ai.google.dev/gemini-api/terms.

Chat deadline45 seconds; model/retrieval deadline30 seconds each within the outer deadline; browser60 seconds. Dedicated model pool2 connections and semaphore2 with0.2-second admission wait isolate market retrieval; busy requests reserve no model call. `CHAT_DAILY_REQUEST_LIMIT` defaults20 attempted calls/process/UTC day, failures count,0 disables. Restarts reset and workers are independent. This is neither a distributed quota nor account-billing verification. Google's quotas are additional limits; add public access controls before deployment.

`GET /api/v1/crypto-history/{asset_id}?timeframe=1d|1w|1m|1y` is independent of analysis. No model/research rerun on timeframe changes.

Response: `asset_id`, `timeframe`, `currency: "USD"`, `source`, `source_url`, `sampling`, `points: [{timestamp,price}]`, `warnings`, `retrieved_at`, `coverage_start`, `coverage_end`, `period_change_percent`, `max_drawdown_percent`.

Price samples are positive finite numbers, sorted and deduplicated. CoinGecko samples are aggregated observations, not candle closes. Coinbase fallback uses completed USD candle closes and close-time labels. Its one-year query is split to respect the 300-bucket request cap. Missing intervals/partial retrieval are disclosed; never fabricate a graph.

Period change = `(last / first - 1) × 100`. Maximum sampled drawdown = minimum `(price / preceding running peak - 1) × 100` (non-positive). These use returned samples only and can understate intraperiod losses; incomplete coverage is disclosed. They are not forecasts or annualized volatility.

## Errors, latency and cache

Non-2xx response: `{ "error": { "code": "...", "message": "...", "request_id": "..." } }`.

400 `INVALID_REQUEST` or `UNKNOWN_ASSET`;503 `RETRIEVAL_TIMEOUT`, `ASSET_RESOLUTION_UNAVAILABLE` or `PROVIDER_UNAVAILABLE`;500 `INTERNAL_ERROR`. Partial market retrieval returns200 with warnings and null metrics. Chat disabled/provider/model failures return200 with `status:"unavailable"`; invalid input still400. Retired `/api/v1/stock-analysis` returns410 `ENDPOINT_RETIRED`.

Market/provider GETs have a4-second wall deadline. Analysis/history operations are bounded at14 seconds. Quote/news retrieval runs in parallel with a dedicated pooled market client. Per-process cache/locks are bounded128; identity metadata caches3600 seconds, search60, quotes60, news300, history120 for1D and300 otherwise. Duplicate lookups share a lock; locks clean up after all waiters finish. Unavailable market responses cache briefly; retrieval time remains original population time. No personalized answer cache, distributed cache or production abuse protection exists.

## Frontend requirements

Display unknown values as Unavailable. Show the submitted question without a collapsed disclosure, pair it with its completed response, and show topic-level evidence labels and adjacent limitations. Editing a draft requires resubmission; never relabel an old answer with a new draft. Older responses without sections retain the overview with an explicit coverage notice. Show quote/retrieval dates and provider scope. Never mix an old result with a newly submitted asset. Chart uses actual elapsed timestamps, USD precision suitable for small prices, UTC labels, and an accessible data table. Cancelling/changing a timeframe must not show stale responses. Browser requests abort after 20 seconds. Dolphin animation respects reduced-motion settings.

Optional snapshot preferences persist only with browser-storage opt-in; reset deletes them. Hosted-profile sharing is disabled, while asset context requires opt-in. Completed snapshot profile is shown independently of draft. Chat history is page-memory only and excludes mismatched assets and previously profile-shared turns from future requests; clearing local history cannot delete data already sent to Gemini. Oversized turns are omitted as whole pairs. Chat text is escaped; only safe HTTP(S) citations are clickable. Responses claiming profile application are rejected as contract violations.

## Provider configuration

CoinGecko Demo key: backend environment `COINGECKO_DEMO_API_KEY`. Pro key: `COINGECKO_PRO_API_KEY` (uses Pro host). Without keys, access is best-effort and may be limited. Historical access/granularity depends on provider tier; one-year history is not guaranteed. Coinbase public Exchange endpoints are a single-market fallback, not global crypto aggregates. No Binance/USDT-to-USD substitution.

Frontend dev proxy forwards `/api` to backend loopback port 8000. Production must provide same-origin `/api` reverse proxy and request/rate controls; do not publish development servers as a production deployment.
