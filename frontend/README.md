# Fin frontend

The React app for Fin. React 18, TypeScript and Vite, with no UI or chart libraries. The mascot and charts are inline SVG.

## Run it

You need Node 20.19+ or 22.12+.

```bash
npm ci
npm run dev        # http://localhost:5173
npm run build      # type-check, then production build
npm test           # node --test, no browser needed
npm run lint       # oxlint
npm run typecheck
```

The app calls relative `/api/v1/...` paths. In development Vite proxies them to `localhost:8000`, so start the backend too. In production the host has to forward `/api` to the backend (`vercel.json` does this on Vercel, see [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)).

## How it works

- **One page, local state.** `App.tsx` holds the state. There's no router or store.
- **Stale responses are ignored.** Every request has an `AbortController` and a version number, so cancelling really cancels and an old response can't replace a new one.
- **The API is not trusted.** Responses go through hand-written validators in `src/lib/cryptoApi.ts` and `chatApi.ts` before anything renders. The types in `src/types/` mirror the backend schemas.
- **Charts load separately.** After an analysis, the price chart fetches its own history. Switching timeframes or retrying only calls the history endpoint.
- **Nothing is made up.** Missing values show as "Unavailable". There are no mock prices, and external links only allow `http` and `https`.

## Privacy

The research profile is saved in `localStorage` only if the user ticks the opt-in box, and Reset deletes it. The profile is never sent to the chat. Chat history lives in page memory only, and sharing the analyzed asset with the chat needs its own opt-in.

## Chart and accessibility

The SVG chart plots real elapsed time on the x-axis, not observation order. It drops invalid or duplicate points and says when it did. Y-axis precision adapts to small coins. There's a text table of the exact values behind every chart.

Also in place: a skip link, live regions for status and errors, visible focus, reduced-motion support and a layout that works on phones.

## Tests

56 tests run through `node --test`. They load the real source files with the TypeScript compiler and a small stand-in for React's hooks, so they're fast but aren't a real browser. There's also an optional Playwright check, `tests/browser_smoke.py`, which starts both servers and uses live providers. It needs Playwright and Chromium installed, and ports 8000 and 5173 free.
