# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


---

# Project: Fin • Crypto Research Buddy

React 18 + Vite + TypeScript frontend (`frontend/`) over a FastAPI backend (`backend/`). Crypto-only, informational research. It started as a stock app and was pivoted; don't reintroduce stock code.

## Commands
```
# backend (from backend/)
python -m uvicorn app.main:app --reload --port 8000     # docs at /docs
python -m pytest -q

# frontend (from frontend/)
npm ci && npm run dev        # http://localhost:5173, proxies /api to :8000
npm test                     # node --test tests/*.test.mjs
npm run build                # tsc -b && vite build
npm run lint                 # oxlint
npm run typecheck            # tsc -b --noEmit
```
Backend venv lives at `backend/.venv` (gitignored).

## Architecture
- Backend layers: `app/routes` → `app/schemas` → `app/services` → `app/tools`. Routes are mounted in `app/main.py`; everything is under `/api/v1`.
- Market data: `tools/crypto_data.py` (CoinGecko, Coinbase fallback for 8 mapped coins, Google News RSS headlines), with a TTL cache.
- Answers: `services/crypto_research.py` is rule-based (no LLM). `services/crypto_chat.py` is the only Gemini call.
- API contract: `crypto_research_buddy_contract.md`. Frontend mirrors it by hand in `src/types/crypto.ts` and `src/types/chat.ts`, with fetch code in `src/lib/cryptoApi.ts` and `src/lib/chatApi.ts`.
- Single-page UI in `src/App.tsx` with local state only. No router or store.

## Hard rules
- Informational only: never trade, never give suitability scoring or buy/sell advice.
- The research profile is never sent to the chat endpoint (enforced in `schemas/chat.py` and the service). Keep it that way.
- Keep chat safeguards: model allowlist, citation-ID validation, API-key-not-in-output check, daily cap, `GEMINI_FREE_TIER_CONFIRMED` gate.
- Never put API keys in code, logs, tests or commits. `.env*` is gitignored except `.env.example`.
- Tests must not hit the network. `backend/tests/conftest.py` blocks HTTP transports, so mock providers.
- Changing a backend schema means changing the matching frontend type, validator and test in the same change.
- No new dependencies without asking.

## Environment variables (backend, none loaded from a file automatically)
`GEMINI_API_KEY`, `GEMINI_FREE_TIER_CONFIRMED` (must be exactly `true`), `GEMINI_MODEL` (allowlist only), `CHAT_DAILY_REQUEST_LIMIT` (default 20), `COINGECKO_DEMO_API_KEY`, `COINGECKO_PRO_API_KEY`, `FRONTEND_ORIGINS`. See `backend/.env.example`.

## Git workflow
- Remote: `origin` = `yebin1123/Agentic-Ai-Hackathon-Grail-MSU-10-2026-siavash-yebin`. Work on branches; no force pushes to `main`.
- Tag `pre-merge-main` marks `main` before local work was merged in. Don't move or delete it.
- Commit and push only when asked.
- Plain `git push` over HTTPS fails in this terminal. Use `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push`, or run `gh auth setup-git` once.

## Before saying "done"
Run `python -m pytest -q` (backend), and `npm test`, `npm run lint`, `npm run build` (frontend). Report real results. If something can't run (live Gemini, Playwright browser tests, which need keys and network), say so rather than claiming it passes.

## Known gotchas
- The Playwright tests in `frontend/tests/browser_*.py` use live providers and need ports 8000/5173 free; they are flaky and not part of the normal checks.
- `VERIFICATION.md` records past test results; re-verify rather than trusting its counts.
- Verify the Gemini model ID against current Google docs before changing the allowlist.
- Rule-based answers use keyword regexes; fragile by design, noted in `PRODUCT_ROADMAP.md`.
