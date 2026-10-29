# Improvement proposals

Findings from a read-through of the repo. Items marked **done** were applied in the `chore/claude-framework-and-cleanup` branch; the rest are proposals, ordered roughly by value per effort.

## Done
- Removed dead stock-era backend/frontend code and the stale stock tests (4 of them were failing against the 410 route).
- Untracked `.idea/` and the hackathon zip.
- Added `lint`/`typecheck` scripts, `requirements-dev.txt`, `.env.example`, CI, `CLAUDE.md`.
- Tightened `Risk.severity` to a union type, trimmed `FRONTEND_ORIGINS`, restricted CORS headers to `Content-Type` (with tests), fixed two lint warnings.

## Proposals

### Quick wins
1. **One fetch wrapper.** `requestJson` (`cryptoApi.ts`) and `chatJson` (`chatApi.ts`) are near-duplicates; merge into one with `{timeoutMs, label}`. Same for the two URL-safety helpers in `format.ts` and `links.ts`.
2. **Tighten types.** `Source.publisher` and `submitted_question` still differ slightly from the backend schema (`Risk.severity` is done).
3. **Don't cache failures for the full TTL** in `tools/crypto_data.py`; use a short negative cache.
4. **Log with `request_id`.** The unhandled-exception handler returns a request id that appears nowhere in logs, and `chat()` swallows exceptions silently.
6. **`VITE_API_BASE_URL`** for deployments without a same-origin `/api` proxy.

### Medium
6b. **Remaining 7 lint warnings** (`set-state-in-effect`): effects that set "loading" state when a fetch starts (`App.tsx`, `AssetPicker.tsx`, `PriceChart.tsx`, `CryptoChat.tsx`, `AnalysisForm.tsx`). A small shared data-fetching hook (or TanStack Query) would remove most of them and the duplicated abort/version logic.
7. **Cache chart history** per `(asset, timeframe)` and keep the old chart visible while a new timeframe loads (currently flashes empty).
8. **Generate frontend types from `/openapi.json`** (or validate with zod) to stop hand-maintained drift.
9. **Settings class + `Depends` services** instead of module-level singletons mutated in the lifespan.
10. **Split `tools/crypto_data.py`** (422 lines) into identity, snapshot, history and news modules.
11. **Real component tests** (React Testing Library + jsdom); mock the network in the Playwright tests so they stop depending on live providers.
12. **Accessibility:** move focus or announce on completed analysis and chat replies; combobox/listbox pattern for the asset picker; fix the skip link target.
13. **Pin Python dependencies** (lockfile via `uv` or `pip-compile`).

### Larger
14. **Rate limiting** (per IP) on search, asset detail and chat; the daily chat cap is per-process, resets on restart and counts failures.
15. **Server-side chat history** or signed turns; the client can currently forge `assistant` messages.
16. **Live evaluation of the chat** (the roadmap's ~20 questions) for scope, prompt injection via headlines, and citation accuracy.
17. **Replace regex topic answers** in `services/crypto_research.py` with an LLM or classifier, as `PRODUCT_ROADMAP.md` suggests.
18. **Deployment doc** for the production reverse proxy; the Vite dev proxy is not part of the build.
