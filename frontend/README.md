# Fin - Crypto Research Buddy

A frontend-only, ocean-themed crypto research desk built with React 18, TypeScript, and Vite. No additional dependencies, remote fonts, images, or scripts. Fin's original inline SVG dolphin gently bobs and moves its tail; all animations respect `prefers-reduced-motion`.

## Run

Requires Node 20.19+ or 22.12+ (current LTS recommended). Vite and its React plugin were upgraded from the original prototype to resolve reported dependency advisories. Use `npm ci` for the checked-in lockfile.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

The existing Vite development proxy forwards `/api` to `http://localhost:8000`. Run the backend separately. For production (including `npm run preview`), serve the frontend behind a same-origin reverse proxy that routes `/api` to the backend. The frontend uses relative API paths; it does not contain backend implementation or credentials.

## Backend contract

- `GET /api/v1/assets`: featured catalog; `GET /api/v1/assets/search?q=...`: bounded candidates; `GET /api/v1/assets/{id}`: full identity with available platforms/contracts. Debounced abortable search never auto-selects a candidate, and detail failure never substitutes another asset.
- `POST /api/v1/crypto-analysis`: JSON `{ asset_id, question, profile? }`. Returns visible question echo, structured answer sections, applied profile/tailored notes, sourced pros/cons/unknowns and existing market/risk/source fields. Snapshot mode remains `deterministic`.
- `GET /api/v1/chat/config` and `POST /api/v1/chat`: separate Gemini free-tier crypto conversation with optional asset context, disabled hosted-profile sharing, safe citations, limitations, model and answered/out-of-scope/unavailable status.
- `GET /api/v1/crypto-history/{asset_id}?timeframe=1d|1w|1m|1y`: independent USD history with points, provider, coverage, sampling, warnings, retrieval time, period change, and maximum drawdown.

Requests use native `fetch`, cancellation and readable validation/network errors. Research/history time out after 20 seconds; chat has a separate 60-second timeout. No prices, assets, source links or disabled-model answers are substituted with mocks.

## Research flow and disclosures

Search/select a canonical crypto asset and optionally include a qualitative research profile. Snapshot answers are deterministic and disclose unsupported topics. Profile preferences save only with browser-storage opt-in; reset deletes preferences and revokes hosted sharing. No opaque suitability score or trading instructions are presented.

Crypto chat is independent of a completed analysis. It sends questions and selected prior messages to Gemini; asset context requires opt-in. Saved profile fields are never serialized into free chat, including stale consent requests. API config requires `provider:gemini` and `profile_sharing:disabled_free_tier`; a response claiming profile application is rejected. Chat remains unavailable without server-side free-key/confirmation setup. Unpaid prompts/responses may improve Google products and be human reviewed; users are warned not to enter personal/financial/confidential data. There is no paid fallback and the client cannot inspect project billing. History is page-memory only; clearing it cannot delete provider data. Future history filters mismatched assets and previously shared-profile turns. Questions max2000, prior messages max12/4000 characters each, aggregate input16000; whole oversized turns are not resent. Answers up to8000 characters display without truncation. Citation-ID validation and mocked scope tests are not factual/semantic guarantees.

Submitting a new request clears previous results and unmounts/cancels the previous history request. Cancelled and stale analysis responses cannot replace the current request. Price history first loads after successful analysis, defaults to one week, and follows the **analyzed** asset, not an unsubmitted selector change. Switching timeframes or retrying history only calls the history endpoint, never analysis. Previous chart data is cleared during loading; failed/empty history does not remove the overview.

The snapshot includes price, change, valuation, volume/scope, supplies, range, and all-time-high context, with provider and UTC timestamps. Missing/nonfinite values display `Unavailable`, not zero; maximum supply being unavailable is not interpreted as unlimited. Risk panels, original source links, freshness metadata, and both overview/history warnings remain visible. External links allow only HTTP(S) and open with `noopener noreferrer`.

## Native chart and accessibility

SVG horizontal positions reflect actual elapsed time, not observation indexes. Invalid timestamps, nonfinite/negative prices, and duplicate timestamps are removed, with an omission warning; observations are sorted chronologically. Single observations render a centered dot and flat series render a centered line. Y-axis labels show actual minimum/maximum values with adaptive USD precision for small coins. UTC date/time labels, SVG title/description, a scrollable exact-observation table, provider labels, and loading/error/empty states accompany every timeframe.

Keyboard-friendly native form controls, visible focus rings, a skip link, status/alert announcements, reduced motion, and responsive layouts are included. On narrow screens the time-based chart scrolls horizontally to keep labels readable.

## Verification

`npm run build` strictly type-checks and creates `dist/`. Run `npm test` for dependency-free regression checks using the existing TypeScript compiler. For optional real-browser integration, install Python Playwright and its Chromium dependencies, stop other servers on ports 8000/5173, and run `python3 frontend/tests/browser_smoke.py` from project root. It starts/stops local servers, uses live providers, and checks chart timeframes, history-only requests, mobile overflow and reduced motion. This browser check also depends on available provider data. The app contains no mock mode.
