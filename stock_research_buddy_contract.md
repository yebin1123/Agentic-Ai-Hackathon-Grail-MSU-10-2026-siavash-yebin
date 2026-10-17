# Stock Research Buddy — Frontend/Backend Contract (v0.1)

**Purpose:** A small, working stock-research dashboard that can grow into a personalized investment research buddy. This contract is the shared agreement between the frontend and backend developers.

**MVP principle:** Build one end-to-end workflow first: a user enters a ticker and asks a question; the backend retrieves available market/news evidence, invokes the agent, and returns a structured answer the dashboard can render. Do not build a multi-turn chatbot, brokerage connection, autonomous trading, or continuous monitoring in the first version.

## 1. Who owns what

### Frontend owner
- Build the dashboard, ticker input, question field, Analyze button, loading/error states, and results view.
- Render the response sections defined below: answer, market snapshot, key points, risks, sources, and timestamps/warnings.
- Build against `frontend/src/mocks/sample-stock-analysis.json` before the real backend is ready.
- Call the backend only through one frontend API helper; do not call market-data APIs or the agent runtime directly from the browser.
- Do not put API keys, agent gateway tokens, or other secrets in frontend code.

### Backend / agent owner
- Own the API endpoint, request validation, market/news data retrieval, agent/tool orchestration, and response validation.
- Return the exact response shape below, even if some data is unavailable.
- Keep provider-specific code and Grail/OpenClaw/agent-runtime details behind the backend service layer. The frontend must not depend on a particular agent framework or data provider.
- Attach source URLs and timestamps to retrieved evidence. Never invent a quote, a current event, a source, or a publication date.
- Compute deterministic numeric values in code where practical; use the LLM to explain and synthesize evidence.

### Shared ownership
- Both developers agree to this file before parallel work begins.
- The frontend can use mock data while the backend is being built.
- Integrate as soon as the backend returns one valid response. Avoid waiting until the end to connect the pieces.

## 2. MVP API

### `GET /api/v1/health`
Returns a basic health check, for example:

```json
{"status":"ok"}
```

### `POST /api/v1/stock-analysis`
Analyzes one stock in response to one user question.

**Request JSON**

```json
{
  "ticker": "NVDA",
  "question": "What are this company's main growth drivers and risks?"
}
```

Rules:
- `ticker`: required string; trim whitespace and normalize to uppercase. The backend validates the symbol or returns `400 INVALID_TICKER`.
- `question`: required non-empty string; limit to a reasonable maximum such as 1,000 characters.
- MVP is single-turn: no `conversation_id` yet.
- MVP does not require a profile or holdings. Add those only when the basic end-to-end flow works.
- The backend owns the choice of market-data/news provider and which tools the agent calls.

## 3. Successful response contract

HTTP `200 OK` returns this shape. Fields stay present even when their values are unknown; use `null`, an empty array, or a warning rather than making up data.

```json
{
  "request_id": "req_example",
  "ticker": "NVDA",
  "company_name": null,
  "answer": "A concise answer to the user's question, grounded in the retrieved evidence.",
  "market_snapshot": {
    "price": null,
    "currency": null,
    "change_percent": null,
    "as_of": null,
    "source": null
  },
  "key_points": [
    {
      "category": "growth_driver",
      "title": "Example finding title",
      "detail": "Evidence-based explanation with uncertainty stated where appropriate."
    }
  ],
  "risks": [
    {
      "title": "Example risk",
      "detail": "Why the risk matters and what could make the assessment wrong.",
      "severity": "unknown"
    }
  ],
  "sources": [
    {
      "title": "Source title",
      "url": "https://example.com/source",
      "publisher": "Publisher name",
      "published_at": null,
      "source_type": "news"
    }
  ],
  "meta": {
    "generated_at": "2026-01-01T12:00:00Z",
    "data_as_of": null,
    "warnings": []
  }
}
```

**Important:** All values above are illustrative placeholders, not market data or an actual analysis. In real responses, `generated_at` must be the actual generation time. Use ISO-8601 timestamps with a timezone, preferably UTC (`Z`).

### Field definitions

| Field | Type | Contract |
|---|---|---|
| `request_id` | string | Unique identifier for this request; useful for logs and debugging. |
| `ticker` | string | Normalized ticker requested by the user. |
| `company_name` | string or `null` | Company name if reliably resolved. |
| `answer` | string | Plain-text summary that the frontend can display directly. Avoid requiring the frontend to parse Markdown to get the answer. |
| `market_snapshot` | object or `null` | Latest available quote snapshot. If an individual field is unavailable, it may be `null`. |
| `market_snapshot.price` | number or `null` | Quote price; do not imply it is live unless the provider supports that. |
| `market_snapshot.currency` | string or `null` | Currency code, e.g. `USD`. |
| `market_snapshot.change_percent` | number or `null` | Percentage change for the period defined by the data provider. State the period in the UI if known; otherwise avoid implying a timeframe. |
| `market_snapshot.as_of` | timestamp or `null` | When the quote applies to, not when the page was loaded. |
| `market_snapshot.source` | string or `null` | Provider/source name. |
| `key_points` | array | Concise evidence-based findings. `category` examples: `growth_driver`, `valuation`, `catalyst`, `market_context`, `other`. |
| `risks` | array | Key risks and counterarguments. `severity` is `low`, `medium`, `high`, or `unknown`; do not fake precision. |
| `sources` | array | Sources actually consulted. The frontend renders clickable links. `source_type` examples: `news`, `company_filing`, `market_data`, `macro_data`, `other`. |
| `meta.generated_at` | timestamp | When this response was generated. |
| `meta.data_as_of` | timestamp or `null` | Best summary of the freshest data used. Individual source timestamps remain authoritative for each source. |
| `meta.warnings` | array of strings | Limitations, missing providers, stale data, or incomplete retrieval. Empty array if there are no relevant warnings. |

Frontend resilience rules:
- Render `null` as “Unavailable” or omit the affected value; never display `null` to the user.
- Render empty arrays as an empty state, not a broken page.
- Treat unknown `category` or `source_type` values as a generic label rather than crashing.
- Always show data timestamps or warnings when information may be stale.
- Render source links only from returned `sources`; do not generate links from model text.

## 4. Error contract

Errors use a non-2xx HTTP status and this JSON structure:

```json
{
  "error": {
    "code": "INVALID_TICKER",
    "message": "The ticker could not be validated.",
    "request_id": "req_example"
  }
}
```

Initial codes:
- `400 INVALID_REQUEST` — missing/invalid ticker or question.
- `400 INVALID_TICKER` — ticker is not recognized by the configured provider(s).
- `429 RATE_LIMITED` — provider or application limit reached.
- `502 DATA_PROVIDER_ERROR` — required external data service failed.
- `503 ANALYSIS_UNAVAILABLE` — analysis could not be completed.
- `500 INTERNAL_ERROR` — unexpected server error.

Do not return stack traces, API keys, agent tokens, or internal prompts to the browser. If some sources fail but the agent can still safely produce a useful, qualified answer, return `200` with warnings instead of failing the entire request.

## 5. Definition of done for the first demo

The MVP is complete when:
1. User enters a valid ticker and a question in the dashboard.
2. Clicking Analyze shows a loading state and calls `POST /api/v1/stock-analysis`.
3. The backend retrieves at least one real data source when credentials/connectivity permit, invokes the agent, and validates the structured result.
4. The UI displays the answer, market snapshot if available, key points, risks, and source links.
5. Missing/stale data is clearly disclosed; no invented live numbers or citations appear.
6. Invalid input and failed API calls show understandable error messages.
7. The demo works from a known starting state without needing code edits during the presentation.

## 6. Suggested code layout

One possible layout; adapt to the hackathon starter project instead of spending time reorganizing it.

```text
project/
  docs/
    api-contract.md                 # This shared agreement
  frontend/
    src/
      components/                   # Dashboard cards, forms, source list
      lib/stockAnalysisApi.ts       # Single function that calls the backend
      mocks/sample-stock-analysis.json
  backend/
    app/
      main.py                       # FastAPI app and route registration
      schemas/stock_analysis.py     # Request/response models (e.g. Pydantic)
      routes/stock_analysis.py     # POST /api/v1/stock-analysis
      services/research_buddy.py   # Orchestrates the agent and evidence
      tools/market_data.py         # Price/news provider adapters
```

The frontend can use TypeScript types matching the JSON contract. The backend can use Pydantic models matching the same contract. For a two-hour event, keep the documented contract plus a shared sample JSON fixture as the source of truth; avoid building a separate schema-generation pipeline unless already provided by the starter kit.

## 7. How to build and pair back together

1. **First 5–10 minutes:** copy this file into the repo, agree on endpoint and field names, and ensure both people can run the starter project.
2. **Frontend works independently:** implement the UI with `sample-stock-analysis.json`. Create `analyzeStock({ ticker, question })` in one place, initially returning the mock fixture.
3. **Backend works independently:** create the route and make it return the example response shape first. Then connect real retrieval and the agent behind it.
4. **Integrate early:** change the frontend helper from mock to HTTP without changing the UI components. Get one request through the full system as soon as possible.
5. **Test together:** test one valid stock question, an invalid ticker, missing news/quote data, and a provider failure.

## 8. Growth path without breaking the MVP

Keep the initial endpoint stable. Add capabilities in small steps:

- **v0.1 — Stock Q&A dashboard:** ticker + question; sourced answer and risk points.
- **v0.2 — Investor profile:** add an optional `investor_profile` object once the backend actually uses it, with fields such as `risk_tolerance`, `investment_horizon_years`, `goals`, and `preferences`. The analysis should indicate whether personalization was applied.
- **v0.3 — Portfolio context:** add holdings such as `{ "ticker": "AAPL", "shares": 10 }` and show potential overlap/concentration plus why a stock or market event may matter to the portfolio. Calculate weights in code when reliable market values are available.
- **v0.4 — Watchlist and refresh:** analyze several tickers, show recent developments, and allow on-demand refresh with timestamps. Continuous background monitoring can come later.
- **v0.5 — Chat:** introduce `POST /api/v1/chat` with `conversation_id`, `message`, and explicitly scoped user/portfolio context. Keep the first stock-analysis endpoint available for the dashboard.

Compatibility rules:
- Add optional response fields rather than renaming or removing existing fields.
- Frontend must ignore unknown response fields and tolerate missing optional information.
- Do not change a field's type or meaning within `/api/v1`.
- If a future change must break compatibility, create `/api/v2` or a new endpoint.
- Do not send a new field from the frontend until the backend accepts and handles it; never silently ignore user-provided risk preferences.

## 9. Agent behavior requirements

- Use available data/news tools before making claims about current prices or recent events.
- Distinguish confirmed facts, interpretation, and uncertainty.
- Cite only sources actually retrieved; provide URLs and timestamps where available.
- If reliable evidence cannot be retrieved, say so and qualify the answer.
- Describe investment ideas as research candidates, with potential upsides and counterarguments; do not promise returns or treat the output as guaranteed personalized financial advice.
- Do not execute trades or request brokerage credentials in the MVP.

---

**Contract owner:** Both developers. Any change to endpoint shape or response fields should be agreed by both, reflected in this file, and accompanied by an updated mock response.
