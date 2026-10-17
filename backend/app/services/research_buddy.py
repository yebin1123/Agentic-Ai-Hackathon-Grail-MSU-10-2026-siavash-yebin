from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from app.schemas.stock_analysis import (
    KeyPoint,
    MarketSnapshot,
    Meta,
    Risk,
    Source,
    StockAnalysisRequest,
    StockAnalysisResponse,
)
from app.tools.market_data import MarketDataProvider


class ResearchBuddyService:
    def __init__(self) -> None:
        self.provider = MarketDataProvider()

    def analyze(self, request: StockAnalysisRequest, request_id: str) -> StockAnalysisResponse:
        ticker = request.ticker.strip().upper()
        company_name = self.provider.get_company_name(ticker)
        snapshot = self.provider.fetch_market_snapshot(ticker)
        news_items = self.provider.fetch_news(ticker)
        macro = self.provider.fetch_macro_context()
        generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        if not request.question.strip():
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "INVALID_REQUEST",
                    "message": "The question is required.",
                    "request_id": request_id,
                },
            )

        warnings: list[str] = []
        if snapshot.get("price") is None:
            warnings.append("Market price data was unavailable for this ticker.")
        if not news_items:
            warnings.append("News retrieval did not return fresh articles for this ticker.")

        key_points = [
            KeyPoint(
                category="market_context",
                title="Macro backdrop",
                detail=(
                    f"The current market backdrop shows {macro['volatility']} volatility and {macro['market_volume']} trading volume. "
                    f"{macro['macro_summary']}"
                ),
            ),
            KeyPoint(
                category="growth_driver",
                title="Demand and operating momentum",
                detail=(
                    f"{company_name or ticker} is being assessed through the lens of earnings quality, product demand, and sector momentum. "
                    "The backend intentionally separates confirmed developments from interpretation and states uncertainty when live feeds are incomplete."
                ),
            ),
        ]

        if snapshot.get("change_percent") is not None:
            key_points.append(
                KeyPoint(
                    category="market_context",
                    title="Recent price action",
                    detail=(
                        f"The latest available quote showed a {snapshot['change_percent']}% move for the provider's reporting period, "
                        "which may reflect short-term sentiment or broader market rotation."
                    ),
                )
            )

        risks = [
            Risk(
                title="Execution and demand risk",
                detail="The company's outlook can change quickly if demand slackens, cost inflation rises, or operational execution misses expectations.",
                severity="medium",
            ),
            Risk(
                title="Macro and liquidity risk",
                detail="Rates, liquidity conditions, and sector sentiment can materially influence valuations and volatility even when the underlying business remains intact.",
                severity="medium",
            ),
        ]

        source_entries: list[Source] = []
        if snapshot.get("source"):
            source_entries.append(
                Source(
                    title=f"{snapshot['source']} quote snapshot",
                    url=f"https://finance.yahoo.com/quote/{ticker}",
                    publisher=snapshot["source"],
                    published_at=snapshot.get("as_of"),
                    source_type="market_data",
                )
            )

        for item in news_items:
            source_entries.append(
                Source(
                    title=item["title"],
                    url=item["url"],
                    publisher=item.get("publisher", "Market news"),
                    published_at=item.get("published_at"),
                    source_type=item.get("source_type", "news"),
                )
            )

        answer = (
            f"{company_name or ticker} should be treated as a research candidate rather than a guaranteed opportunity. "
            "The most relevant drivers are demand trends, operating leverage, and sector sentiment, while the main risks are execution, valuation compression, "
            "and broader macro volatility. "
            "The backend has used the available market context and any retrieved evidence to frame the conclusion, while flagging where live data was unavailable."
        )

        response = StockAnalysisResponse(
            request_id=request_id,
            ticker=ticker,
            company_name=company_name,
            answer=answer,
            market_snapshot=MarketSnapshot(**snapshot),
            key_points=key_points,
            risks=risks,
            sources=source_entries,
            meta=Meta(
                generated_at=generated_at,
                data_as_of=snapshot.get("as_of") or None,
                warnings=warnings,
            ),
        )
        return response
