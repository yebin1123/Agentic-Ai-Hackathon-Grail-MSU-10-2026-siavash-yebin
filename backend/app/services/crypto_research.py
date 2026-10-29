import asyncio
import re

from app.schemas.crypto_analysis import AnswerSection, CryptoAnalysisResponse, KeyPoint, Meta, Risk, Source
from app.services.research_context import asset_arguments, personalized_notes
from app.tools.crypto_data import CryptoDataProvider, utc_now


def matches(question, pattern):
    """Bounded topic matching, not semantic reasoning or a language model."""
    return re.search(r"\b(?:" + pattern + r")\b", question, flags=re.IGNORECASE) is not None


def usd(value):
    if value is None:
        return "unavailable"
    if value == 0:
        return "$0.00"
    return f"${value:,.2f}" if value >= 1 else f"${value:,.8g}"


def supply(value):
    return "unavailable" if value is None else f"{value:,.4f}".rstrip("0").rstrip(".")


def answer_question(question, asset, snapshot):
    """Render explicit evidence and gaps for recognized snapshot topics only."""
    sections = []

    def add(topic, title, answer, status="limited", limitation=None):
        sections.append(AnswerSection(topic=topic, title=title, answer=answer,
                                      status=status, limitation=limitation))

    if matches(question, r"price|prices|market|momentum|return|returns|change|performance|overview"):
        facts = [f"{asset.symbol}'s reported USD price is {usd(snapshot.price_usd)}."]
        if snapshot.change_24h_percent is not None:
            facts.append(f"Its provider-reported 24-hour price change is {snapshot.change_24h_percent:+.2f}%.")
        else:
            facts.append("The 24-hour price change is unavailable.")
        if snapshot.high_24h_usd is not None or snapshot.low_24h_usd is not None:
            facts.append(f"Reported 24-hour low / high: {usd(snapshot.low_24h_usd)} / {usd(snapshot.high_24h_usd)}.")
        facts.append(f"Source: {snapshot.source or 'no available quote provider'}.")
        add("market", "Price and 24-hour change", " ".join(facts),
            "answered" if snapshot.price_usd is not None and snapshot.change_24h_percent is not None else "limited",
            "A 24-hour change is a return, not a volatility estimate or a trend forecast. The quote may be delayed and is not a guaranteed execution price.")

    if matches(question, r"liquidity|volume|trading|trade|trades|slippage|depth"):
        scope = snapshot.volume_scope or "scope not supplied"
        add("liquidity", "Trading activity and liquidity", 
            f"Reported 24-hour USD trading volume for {asset.symbol} is {usd(snapshot.volume_24h_usd)}. Coverage: {scope}. "
            + ("This describes reported trading activity, not how much can be bought or sold at a given price."
               if snapshot.volume_24h_usd is not None else "The current source did not supply this USD metric; missing volume is not zero trading activity."),
            limitation="Order-book depth, expected slippage and wash-trading checks are not connected. Reported volume alone cannot establish liquidity quality.")

    if matches(question, r"valuation|supply|supplies|tokenomics|token|tokens|unlock|unlocks|dilution|diluted|cap|fdv|emissions|inflation"):
        facts = [f"Reported circulating supply: {supply(snapshot.circulating_supply)} {asset.symbol}; maximum supply: {supply(snapshot.max_supply)} {asset.symbol}.",
                 f"Market cap: {usd(snapshot.market_cap_usd)}; fully diluted valuation (FDV): {usd(snapshot.fully_diluted_valuation_usd)}."]
        if snapshot.market_cap_usd is not None and snapshot.fully_diluted_valuation_usd is not None and snapshot.fully_diluted_valuation_usd > 0:
            facts.append(f"Market cap / FDV: {snapshot.market_cap_usd / snapshot.fully_diluted_valuation_usd:.2f}.")
        if snapshot.max_supply is None:
            facts.append("An unavailable maximum does not establish unlimited supply.")
        add("tokenomics", "Supply and valuation", " ".join(facts),
            limitation="Market cap and FDV are provider estimates, not intrinsic value. Their ratio is not an unlock schedule; verified vesting, emissions and holder concentration are not connected.")

    if matches(question, r"risk|risks|risky|safe|safety|downside|volatility|volatile|buy|sell|investment|invest|recommendation"):
        evidence = (f"The reported 24-hour return is {snapshot.change_24h_percent:+.2f}%, but that does not measure volatility. "
                    if snapshot.change_24h_percent is not None else "No 24-hour return is available in the snapshot. ")
        add("risk", "Risk evidence and gaps", evidence + f"This dashboard cannot assign {asset.name} an asset-specific risk level or determine whether you should buy or sell it.",
            limitation="A risk assessment needs liquidity depth, a return series with a defined volatility method, leverage, custody, protocol exposure and your circumstances. These are not assessed by this snapshot response.")

    gaps = [
        ("forecast", "Price forecasts", r"forecast|forecasts|predict|prediction|predictions|target|targets|tomorrow|next week|next month|next year|will|should i",
         "I cannot predict a future price, promise a return, or provide a buy/sell recommendation from this snapshot.",
         "No forecasting model or suitability assessment is connected."),
        ("causes", "Why the price moved", r"why|cause|causes|caused|reason|reasons|catalyst|catalysts|driver|drivers|driving",
         "I cannot establish what caused this asset's price move. A price snapshot and headline links are not causal evidence.",
         "Linked articles have not been read or verified; news synthesis is not connected."),
        ("adoption", "Adoption and fundamentals", r"adoption|growth|network|usage|fees|revenue|developer|developers|fundamentals|oracle|oracles|utility|use case|how does|explain how",
         f"Verified network usage, fees, revenue and token value-capture evidence for {asset.name} are not connected, so I cannot conclude that adoption is growing or explain its fundamentals from retrieved evidence.",
         "Next evidence to collect: primary project documentation and consistently defined usage and fee time series."),
        ("security", "Security and custody", r"security|audit|audits|audited|hack|hacks|exploit|exploits|custody|wallet|bridge|contract",
         "I cannot verify whether this asset, its contracts, bridges or custody providers are secure.",
         "No contract audit, incident investigation or wallet analysis is connected."),
        ("regulation", "Regulatory questions", r"regulation|regulatory|legal|laws|law|sec",
         "I cannot establish this asset's legal status or the effect of regulatory changes.",
         "No jurisdiction-specific primary legal sources or legal assessment are connected."),
        ("history", "Longer-period performance", r"weekly|monthly|yearly|week|month|year|7 days|30 days|365 days|drawdown|historical|history",
         "This answer uses the current market snapshot, not the independent chart series. It cannot report a verified longer-period return or drawdown here.",
         "Use the chart's timeframe controls for its returned-period change and sampled drawdown; those observations are not supplied to this response."),
        ("comparison", "Comparing assets", r"compare|comparison|versus|vs|better|outperform",
         "This request retrieves one asset's snapshot, so it cannot establish a cross-asset comparison.",
         "A comparison needs matching timestamps, currencies, metrics and evidence for each asset."),
        ("unlocks", "Unlock dates and emissions", r"unlock|unlocks|vesting|emissions|emission|release schedule",
         "I cannot verify the next token unlock, its amount or the future emission schedule from the market snapshot.",
         "No verified vesting or emissions calendar is connected. Market cap / FDV is not a substitute."),
    ]
    for topic, title, pattern, answer, limitation in gaps:
        if matches(question, pattern):
            add(topic, title, answer, "unsupported", limitation)

    if not sections and re.fullmatch(r"\s*(?:what is|explain|tell me about)\s+(?:" + re.escape(asset.name) + "|" + re.escape(asset.symbol) + r")[?.!\s]*", question, re.IGNORECASE):
        add("adoption", "Project fundamentals", f"Primary project documentation for {asset.name} has not been retrieved, so this snapshot tool cannot provide an evidence-backed explanation of the project.",
            "unsupported", "Project-document retrieval and open-ended research answers are not connected.")

    if not sections:
        add("scope", "Question outside current coverage",
            "I could not match this question to a supported snapshot topic. Ask about the 24-hour price change, reported trading volume, circulating supply, market cap or FDV.",
            "unsupported", "There is no AI model connected. This tool recognizes topic words; it does not understand arbitrary questions or guarantee coverage of every part.")
    return sections


class CryptoResearchService:
    def __init__(self):
        self.provider = CryptoDataProvider()

    async def analyze(self, request, request_id):
        asset = await self.provider.resolve_asset(request.asset_id)
        (snapshot, quote_warnings), (news, news_warnings) = await asyncio.gather(
            self.provider.snapshot(asset.id), self.provider.news(asset.id),
        )
        sections = answer_question(request.question, asset, snapshot)
        points = [KeyPoint(category=section.topic, title=section.title, detail=section.answer) for section in sections]

        risks = [
            Risk(title="Price and liquidity risk", detail="Crypto trades 24/7 and can gap across venues. Consider leverage, slippage and exchange-specific liquidity; risk levels here are educational, not asset-scored.", severity="unknown"),
            Risk(title="Custody and protocol risk", detail="Exchange custody, wallet security, bridge exploits and smart-contract failures are different risks. No wallet connection or contract audit is performed.", severity="unknown"),
            Risk(title="Supply and regulatory uncertainty", detail="Token unlocks, concentration and changing regulation can affect a thesis. No verified unlock calendar or legal assessment is currently connected.", severity="unknown"),
        ]
        sources = [source.model_copy(update={"source_id": f"news-{index}"}) for index, source in enumerate(news, 1)]
        if snapshot.source_url:
            sources.insert(0, Source(source_id="market", title=f"{snapshot.source or 'Provider'} market snapshot", url=snapshot.source_url, publisher=snapshot.source or "Provider", published_at=snapshot.as_of, source_type="market_data"))
        warnings = quote_warnings + news_warnings + [
            "Rule-based response: no AI model is connected. Topic matching may miss parts of a question; news headlines are listed, not read or synthesised.",
        ]
        answer = "\n\n".join(f"{section.title}: {section.answer}" + (f" Limits: {section.limitation}" if section.limitation else "") for section in sections)
        return CryptoAnalysisResponse(request_id=request_id, asset=asset, submitted_question=request.question,
            answer=answer, answer_sections=sections, market_snapshot=snapshot,
            key_points=points, risks=risks, sources=sources,
            applied_profile=request.profile,
            personalized_notes=personalized_notes(request.profile, asset, snapshot),
            pros_cons=asset_arguments(asset, snapshot, sources),
            meta=Meta(generated_at=utc_now(), data_as_of=snapshot.as_of, warnings=warnings))
