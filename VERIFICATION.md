# Crypto redesign verification

## Passing checks

- Backend: `python3 -m pytest -q` — **240 passed**, one upstream Starlette warning about its HTTPX TestClient dependency. HTTPX blockers prevent live requests. Includes existing identity/profile/research tests plus 129 Gemini chat tests: native request/response, free-tier confirmation/allowlist, header key handling, ignored OpenAI config, disabled hosted profiles, quotas/no paid fallback, validation, admission/cancellation and pool isolation.
- Frontend: `npm run build` — strict TypeScript and Vite production build succeed.
- Frontend: `npm test` — **56 passed**: existing geometry/profile/search checks plus Gemini config, disabled profile sharing, stale-profile stripping, rejected false profile-application claims, privacy/terms notices, context filtering, quotas, limits and cancellation. These are rendered/simulated component checks, not Chromium browser tests.
- Frontend: `npm audit` — **0 reported vulnerabilities** at verification time. This is not a guarantee against future advisories.

## Re-verified 2026-10-28 (macOS, Python 3.11, after removing dead stock code)

- Backend `python3 -m pytest -q`: 240 passed (the 4 stale `test_stock_analysis.py` tests that failed against the 410 route were removed).
- Frontend `npm test`: 56 passed; `npm run build` and `npm run typecheck` succeed.
- Frontend `npm run lint` (oxlint): exits 0 with pre-existing React warnings (`set-state-in-effect`, `refs`, `only-export-components`) that have not been addressed.
- Not run: Playwright browser tests, live Gemini or provider calls.

## Live provider checks in this workspace

The following live market/history checks were performed for the earlier crypto redesign, not rerun for this release. Current profile/search/chat verification uses synthetic backend fixtures and frontend component/API tests. A read-only review sampled public coin metadata, encountering an HTTP429; provider availability remains best-effort. No paid hosted calls were made.

Bitcoin crypto-analysis returned HTTP 200, a CoinGecko quote, and five news headline links. All four history timeframes returned HTTP 200 with CoinGecko samples: 1D 289, 1W 168, 1M 721, 1Y 366. Each measured lookup completed in under one second in this environment. These are observations, not a promise of future latency/coverage or a guarantee that another machine has provider access. No static prices were inserted into the app.

## Not verified

The optional Playwright browser smoke test could not launch Chromium because this Linux workspace lacks browser shared libraries (`libnspr4` and others), and elevated package installation was unavailable. Therefore desktop/mobile visual appearance and full browser interaction have **not** been browser-verified here. A reproducible optional smoke script is provided at `frontend/tests/browser_smoke.py`; it can generate screenshots on a machine with Playwright/Chromium dependencies.

Gemini free-tier integration is implemented but no authenticated/live call, Google project-billing verification, factual/scope/injection evaluation, production deployment, abuse/load test or current Mac test was performed. Mocked scope decisions do not establish model obedience; citation IDs do not prove claim support. Free access for the allowlisted model was checked in Google's pricing documentation, not by an authenticated quota probe. Actual account/region access can differ. Search does not guarantee every token/dataset. DEX Screener, DefiLlama, GoPlus and indexed on-chain providers remain proposed. Your Mac clone must receive updated files before it changes.

## Versions used

- Node 20.20.2; Vite 7.3.7; React 18.3.1; TypeScript 5.9.3; Vite React plugin 5.2.0. Resolved frontend dependency tree is in `frontend/package-lock.json`.
- Python 3.13.5; FastAPI 0.141.1; Uvicorn 0.52.3; Pydantic 2.13.4; HTTPX 0.28.1; pytest 9.1.1.
- Backend dependencies retain minimum ranges; the versions above record the actual test environment. Use a production lockfile before deployment.

No Git commits or pushes were made for this redesign.
