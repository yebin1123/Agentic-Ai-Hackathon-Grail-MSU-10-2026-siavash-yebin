# Fin — product direction and next experiments

## Product thesis

### Current chat decision: free tier only

Paid OpenAI integration was replaced with native Gemini free-tier chat. Only a documented free model is allowlisted; the operator must use an unpaid project with billing disabled and explicitly confirm it. The app cannot inspect project billing. Quota/access failures do not retry or fall back to paid services. Because unpaid prompts/responses may improve Google products and be human reviewed, hosted research-profile sharing is disabled; personalized snapshot panels remain local/backend-only. Private personalized chat would require a locally running model or a separately approved privacy-compatible provider. Remaining target-design sections below are proposals, not permission to send profiles to the current free service.

**A crypto research desk that explains what changed, why it might matter, and what evidence is missing.** Do not compete with exchanges on trading buttons or with charting terminals on the number of indicators. Differentiate through verifiable research, uncertainty, token economics, and an approachable dolphin guide.

## Implemented foundation

Crypto-only featured catalog plus provider-backed CoinGecko search/detail; aggregate data; explicit Coinbase USD fallback mappings; honest timestamps/scope; independent1D/1W/1M/1Y charts; caps/FDV/supply/24h range/ATH context; source links; partial warnings; asynchronous retrieval/deadlines/bounded cache/locks; responsive ocean UI/dolphin. Optional qualitative profiles, tailored research notes, snapshot-dependent strengths/concerns/unknowns, opt-in browser storage and separate hosted crypto chat are implemented. Chat requires explicit key/model; bounded history is client page-memory, not server persistence. No live model call or semantic/factual evaluation has been performed.

## Stage 1 — one real research assistant, not a swarm

### Personalized crypto research — implemented subset and remaining plan

Implemented: qualitative profile/consent/reset, canonical CoinGecko search and detail, snapshot-derived asset arguments and separate hosted-chat adapter with strict output/source-ID checks, isolated pools, bounded admission and per-process demo call cap. Remaining: DEX-only chain/contract discovery, primary-document retrieval, richer protocol/security/on-chain evidence, historical volatility, comprehensive thesis synthesis, live-model scope/citation evaluation and production/privacy/compliance work. The paragraphs below retain the broader target design, not claims that every dataset is connected.

Replace the eight-asset selector with provider-backed search and explicit candidate selection. Maintain canonical provider IDs and chain/contract deployments; display names and tickers are not identity. CoinGecko's full active catalog can provide IDs and optional platforms/contracts. DEX Screener or CoinGecko on-chain/GeckoTerminal pool data can extend discovery to supported DEX tokens. No provider guarantees every crypto has reliable market, history or fundamental data. Distinguish aggregate prices from individual-pool observations, and never silently map a ticker to a Coinbase product.

Add an optional research profile: preferred name, experience, learning/research goal, horizon, willingness to experience losses, ability to absorb losses and liquidity needs, interests, and preferred explanation detail. Keep willingness and capacity separate; do not combine these into a purported validated suitability score. Initially avoid income, identity documents, wallet access and detailed financial data. Ask permission before remembering preferences; make reset/delete available and disclose which profile fields are sent to the model. Proposed default is opt-in browser-only storage for non-sensitive preferences, with no account requirement. The profile should change explanation detail and evidence priorities, not market facts or unsupported financial conclusions.

Present personalized relevance such as “For your short horizon, examine this historical drawdown and exit liquidity,” with exact evidence dates and gaps. Never turn a high self-reported tolerance into a safe-token label or an instruction to take leverage. Show historical volatility (only with documented sampling/window and sufficient observations), sampled drawdown, dilution context, available liquidity proxies and evidence coverage separately rather than one opaque risk number.

Implement genuine crypto-scoped chat using a backend model adapter and retrieved evidence. Permit crypto economics, chains, wallets, DeFi, security, tokenomics and directly relevant macro/regulatory context. Decline unrelated questions or answer only the crypto portion of mixed prompts. Semantic scope enforcement, injection resistance, bounded tools and output validation are required; keyword matching cannot fulfill arbitrary crypto chat. Conversation context must identify when the asset or profile changes. Broad conceptual questions need not force asset selection. Missing keys/models get an explicit disabled or deterministic mode, not a fake AI answer.

Reintroduce asset-specific pros/cons as evidence-backed **potential strengths / concerns / unknowns**. Each item records its source IDs, date, fact vs interpretation, relevance to the submitted profile and caveats. Do not force three positive claims for an obscure token with insufficient evidence; do not treat missing data as demonstrated weakness. Fundamentals need project-specific primary docs and explicit protocol mappings, not cloned BTC/ETH/LINK templates. Fact-level numerical and citation checks remain backend responsibilities.

Implementation sequence: canonical asset search/resolution and bounded caches → profile UI/context echo → evidence-backed asset arguments → genuinely cited crypto-scoped chat → persistence, watchlists and alerts. Confirm model/provider, spending limit, third-party profile sharing and persistence policy before integrating paid services or transmitting personalized context. Real individualized buy/sell or allocation recommendations would need a distinct legal/compliance and suitability review before public launch.

Add a backend-only model adapter, selected after the user chooses a provider/budget. One research orchestrator gathers an evidence bundle, passes the question and verified sources to an LLM, and validates structured output. A chat panel can use the same orchestrator with scoped conversation memory.

Proposed additional endpoint: `POST /api/v1/chat` with conversation ID, asset ID, question, and optional timeframe. Return a plain-text answer, inline source IDs, facts vs interpretation, limitations, and applied context. Store short-lived session memory server-side; do not silently treat a previous BTC question as ETH context.

Keep calculations in code. Validate citations against actually retrieved source IDs. Treat source/article text as untrusted input: it cannot override instructions, request secrets or trigger trades. No autonomous execution. Bound tool calls, time and token spending. If the model is unavailable, return a clearly marked deterministic fallback—not an alleged AI answer.

**First useful conversations:** “What changed since my last visit?”, “Explain why FDV exceeds circulating market cap,” “What evidence would weaken the adoption thesis?”, “Which risks are measured and which remain unknown?”

**Acceptance test:** manually evaluate a fixed set of at least 20 crypto questions. Measure grounded citation accuracy, unanswered-question disclosure, latency, and cost; do not optimize only for confident prose.

## Stage 2 — a skeptical second pass

Once one assistant is reliable, add an optional critique pass (possibly the same model with a separate role): check contradictions, unsupported causal explanations, date freshness, missing counterarguments, and token-supply assumptions. A deterministic citation/number validator is more useful than another agent merely repeating the first agent.

UI: “Bull case / Bear case / What would change my mind / Evidence gaps.” Do not produce unexplained confidence percentages or buy/sell scores.

## Stage 3 — crypto-native fundamentals

1. **DefiLlama:** chain/protocol TVL, fees/revenue and DEX activity. Map assets to chain/protocol IDs explicitly; chain TVL does not directly value its token. Public vs Pro access must be checked per endpoint. Unlock/emission endpoints may require Pro access.
2. **Primary project documentation:** token supply schedules, governance proposals, upgrade calendars and security disclosures. Retrieval and publication timestamps are mandatory.
3. **Derivatives:** exchange-specific funding, open interest and basis from a selected provider. Aggregate comparisons need consistent venues/units; do not substitute these for spot return or volatility. Review commercial/API access before implementing CoinGlass or another provider.
4. **On-chain analytics:** active addresses, transaction fees, token-holder concentration and stablecoin flows from appropriate chain-specific sources. Bots/Sybil addresses and methodology differences require explicit caveats.
5. **Crypto-native news:** add selected direct publisher feeds and primary announcements, verify RSS/API access and reuse terms. Google RSS currently provides headline discovery only. Summarize full articles only after lawful retrieval; explain when only a headline is available.

Do not call any provider universally “best.” CoinGecko supplies broad aggregate context; Coinbase supplies venue-specific USD prices; DefiLlama measures protocol activity; primary documents establish token rules. Their definitions differ.

## Stage 4 — features people come back for

| Feature | Value | Guardrail |
|---|---|---|
| Watchlist + what changed | A research briefing rather than a fresh blank dashboard | Cache evidence snapshots and show exact comparison dates |
| Research notebook | Save a thesis, catalysts, and disconfirming evidence | Never auto-update a user's thesis without consent |
| Normalized comparison charts | Compare BTC, ETH and SOL over the same window | Rebase to 100 at the common start; show missing coverage |
| Evidence timeline | Link price moves to dated events | Say “coincided with,” not causal certainty |
| Token unlock calendar | Crypto-specific dilution context | Primary schedules and verified dates, not FDV-derived guesses |
| Alerts | Meaningful changes in price, funding or research facts | Opt-in, rate-limited, no promised outcomes |
| Educational dolphin | Click Fin to explain FDV, wallets, slippage or drawdown | Deterministic glossary first; never fabricate conversational abilities |

## Chart improvements

Next: hover/crosshair with exact price/time, logarithmic scale option, volume panels, candlestick mode and normalized comparisons. Keep price series and volume definitions separate. Realized volatility requires a documented return sampling frequency/window and adequate coverage; the old absolute daily-return metric is removed.

For real-time charts, prefer a single exchange WebSocket with visible venue/pair labels; do not call it a global market price. Daily closes omit intraday extremes, so sampled drawdown is a lower-resolution historical measure.

## Production work before public launch

Authentication only if saving private notes; server-side secrets; HTTPS and same-origin API routing; rate limits; bounded model/tool budgets; Redis cache; provider cooldowns; observability; dependency locking; accessibility/visual tests; persistence/migrations; user data deletion. A Python virtual environment and Node lockfile isolate local installs.

## Recommended next decision

Choose the primary user: crypto beginner, long-term research investor, or active trader. Fin is currently best positioned for beginners and thesis-based research. Recommend **cited research chat + saved notebook**, then DeFi fundamentals, before trading indicators or multi-agent complexity.

## Provider references consulted

- CoinGecko markets: https://docs.coingecko.com/reference/coins-markets
- CoinGecko historical samples: https://docs.coingecko.com/reference/coins-id-market-chart
- Coinbase candles / 300-bucket cap: https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles
- Coinbase stats / base-unit volume: https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-stats
- DefiLlama public vs Pro API: https://defillama.com/docs/api
- CoinGecko catalog and contract mapping: https://docs.coingecko.com/reference/coins-list
- CoinGecko project metadata: https://docs.coingecko.com/reference/coins-id
- CoinGecko on-chain pool/token search: https://docs.coingecko.com/reference/search-pools
- DEX Screener public pair search and token/pool observations: https://docs.dexscreener.com/api/reference
- GoPlus token-security field definitions and unknown-value caveats: https://docs.gopluslabs.io/reference/response-details
- Moralis multichain data capabilities: https://docs.moralis.com/data-api/overview
- Alchemy indexed token/transfer data: https://www.alchemy.com/docs/data.md
- Gemini free-tier pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini unpaid-service data terms: https://ai.google.dev/gemini-api/terms
- Gemini structured outputs: https://ai.google.dev/gemini-api/docs/structured-output

Access tiers, coverage and quotas can change. Verify them again for deployment rather than treating this document as a guarantee.
