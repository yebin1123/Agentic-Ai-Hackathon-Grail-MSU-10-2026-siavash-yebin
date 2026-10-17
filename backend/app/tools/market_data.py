from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree as ET

import httpx


class MarketDataProvider:
    KNOWN_COMPANIES = {
        "AAPL": "Apple Inc.",
        "MSFT": "Microsoft Corporation",
        "NVDA": "NVIDIA Corporation",
        "AMZN": "Amazon.com, Inc.",
        "META": "Meta Platforms, Inc.",
        "GOOGL": "Alphabet Inc.",
        "TSLA": "Tesla, Inc.",
        "BTC": "Bitcoin",
        "ETH": "Ethereum",
        "SOL": "Solana",
    }

    def is_valid_ticker(self, ticker: str) -> bool:
        cleaned = (ticker or "").strip().upper()
        if not cleaned:
            return False
        if cleaned in self.KNOWN_COMPANIES:
            return True
        if re.fullmatch(r"[A-Z0-9.-]{1,10}", cleaned):
            return True
        return False

    def get_company_name(self, ticker: str) -> str | None:
        return self.KNOWN_COMPANIES.get(ticker.upper())

    def fetch_market_snapshot(self, ticker: str) -> dict[str, Any]:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1mo&interval=1d"
        try:
            response = httpx.get(url, timeout=8.0)
            response.raise_for_status()
            payload = response.json()
            result = payload.get("chart", {}).get("result", [{}])[0]
            meta = result.get("meta", {})
            quote = result.get("indicators", {}).get("quote", [{}])[0]
            closes = quote.get("close") or []
            current_price = closes[-1] if closes else None
            price = float(current_price) if current_price is not None else None
            change_percent = meta.get("regularMarketChangePercent")
            as_of = meta.get("regularMarketTime")
            as_of_iso = datetime.fromtimestamp(as_of, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if as_of else None
            return {
                "price": price,
                "currency": meta.get("currency"),
                "change_percent": float(change_percent) if change_percent is not None else None,
                "as_of": as_of_iso,
                "source": "Yahoo Finance",
            }
        except Exception:
            return {
                "price": None,
                "currency": None,
                "change_percent": None,
                "as_of": None,
                "source": "Market data unavailable",
            }

    def fetch_news(self, ticker: str) -> list[dict[str, Any]]:
        sources = [
            ("Yahoo Finance", f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"),
            ("Google News", f"https://news.google.com/rss/search?q={ticker}+stock&hl=en-US&gl=US&ceid=US:en"),
            ("MarketWatch", f"https://feeds.marketwatch.com/marketwatch/topstories/"),
        ]
        collected: list[dict[str, Any]] = []

        for publisher, url in sources:
            try:
                response = httpx.get(url, timeout=8.0)
                response.raise_for_status()
                root = ET.fromstring(response.text)
                for item in root.findall(".//item")[:3]:
                    title = (item.findtext("title") or "Market news").strip()
                    link = item.findtext("link") or item.findtext("guid") or "https://example.com"
                    published = item.findtext("pubDate") or None
                    collected.append(
                        {
                            "title": title,
                            "url": link,
                            "publisher": publisher,
                            "published_at": published,
                            "source_type": "news",
                        }
                    )
            except Exception:
                continue
            if len(collected) >= 5:
                break

        unique: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in collected:
            url = item["url"]
            if url in seen:
                continue
            seen.add(url)
            unique.append(item)
        return unique[:5]

    def fetch_macro_context(self) -> dict[str, Any]:
        return {
            "volatility": "moderate to elevated",
            "market_volume": "mixed",
            "rates": "market-sensitive",
            "liquidity": "watch closely",
            "macro_summary": "Risk sentiment is driven by rates, liquidity, and sector-specific catalysts; no live macro feed was available in the current backend configuration.",
        }
