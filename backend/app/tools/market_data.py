from __future__ import annotations

import csv
import re
from datetime import datetime, timezone
from io import StringIO
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

    CRYPTO_IDS = {
        "BTC": "bitcoin",
        "ETH": "ethereum",
        "SOL": "solana",
        "ADA": "cardano",
        "DOGE": "dogecoin",
        "XRP": "ripple",
        "BNB": "binancecoin",
    }

    CRYPTO_BINANCE_SYMBOLS = {
        "BTC": "BTCUSDT",
        "ETH": "ETHUSDT",
        "SOL": "SOLUSDT",
        "ADA": "ADAUSDT",
        "DOGE": "DOGEUSDT",
        "XRP": "XRPUSDT",
        "BNB": "BNBUSDT",
    }

    DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
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

    def is_crypto_ticker(self, ticker: str) -> bool:
        return (ticker or "").strip().upper() in self.CRYPTO_IDS

    def fetch_market_snapshot(self, ticker: str) -> dict[str, Any]:
        symbol = (ticker or "").strip().upper()
        if self.is_crypto_ticker(symbol):
            return self._fetch_crypto_snapshot(symbol)
        return self._fetch_equity_snapshot(symbol)

    def _fetch_crypto_snapshot(self, symbol: str) -> dict[str, Any]:
        history = self._build_crypto_history(symbol)

        # Try CoinGecko first for richer metadata
        coin_id = self.CRYPTO_IDS[symbol]
        coingecko_url = (
            f"https://api.coingecko.com/api/v3/coins/markets"
            f"?ids={coin_id}&vs_currency=usd&price_change_percentage=24h&sparkline=false"
        )

        try:
            response = httpx.get(coingecko_url, headers=self.DEFAULT_HEADERS, timeout=2.5)
            response.raise_for_status()
            data = response.json()
            if data:
                entry = data[0]
                return {
                    "price": float(entry.get("current_price")) if entry.get("current_price") is not None else None,
                    "currency": "USD",
                    "change_percent": float(entry.get("price_change_percentage_24h")) if entry.get("price_change_percentage_24h") is not None else None,
                    "as_of": entry.get("last_updated"),
                    "source": "CoinGecko",
                    "market_cap_usd": float(entry.get("market_cap")) if entry.get("market_cap") is not None else None,
                    "volume_24h_usd": float(entry.get("total_volume")) if entry.get("total_volume") is not None else None,
                    "volatility_24h": abs(float(entry.get("price_change_percentage_24h"))) if entry.get("price_change_percentage_24h") is not None else None,
                    "asset_type": "crypto",
                    "history": history,
                }
        except Exception:
            pass

        # Fallback: Coinbase spot + Binance 24h stats
        try:
            coinbase_url = f"https://api.coinbase.com/v2/prices/{symbol}-USD/spot"
            coinbase_response = httpx.get(coinbase_url, headers=self.DEFAULT_HEADERS, timeout=2.5)
            coinbase_response.raise_for_status()
            coinbase_data = coinbase_response.json()
            price = float(coinbase_data["data"]["amount"])

            volume_24h_usd = None
            change_percent = None
            volatility_24h = None

            binance_symbol = self.CRYPTO_BINANCE_SYMBOLS.get(symbol)
            if binance_symbol:
                try:
                    ticker_24h_url = f"https://api.binance.com/api/v3/ticker/24hr?symbol={binance_symbol}"
                    ticker_24h_response = httpx.get(ticker_24h_url, headers=self.DEFAULT_HEADERS, timeout=2.5)
                    ticker_24h_response.raise_for_status()
                    ticker_24h = ticker_24h_response.json()
                    change_percent = float(ticker_24h["priceChangePercent"]) if ticker_24h.get("priceChangePercent") is not None else None
                    volume_24h_usd = float(ticker_24h["quoteVolume"]) if ticker_24h.get("quoteVolume") is not None else None
                    volatility_24h = abs(change_percent) if change_percent is not None else None
                except Exception:
                    pass

            return {
                "price": price,
                "currency": "USD",
                "change_percent": change_percent,
                "as_of": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "source": "Coinbase",
                "market_cap_usd": None,
                "volume_24h_usd": volume_24h_usd,
                "volatility_24h": volatility_24h,
                "asset_type": "crypto",
                "history": history,
            }
        except Exception:
            return {
                "price": None,
                "currency": "USD",
                "change_percent": None,
                "as_of": None,
                "source": "Crypto market data unavailable",
                "market_cap_usd": None,
                "volume_24h_usd": None,
                "volatility_24h": None,
                "asset_type": "crypto",
                "history": history,
            }

    def _fetch_equity_snapshot(self, symbol: str) -> dict[str, Any]:
        yahoo_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1mo&interval=1d"

        try:
            response = httpx.get(yahoo_url, headers=self.DEFAULT_HEADERS, timeout=2.5)
            response.raise_for_status()
            payload = response.json()
            result = payload.get("chart", {}).get("result", [{}])[0]
            meta = result.get("meta", {})
            quote = result.get("indicators", {}).get("quote", [{}])[0]
            closes = quote.get("close") or []
            timestamps = result.get("timestamp") or []
            current_price = closes[-1] if closes else None
            price = float(current_price) if current_price is not None else None
            change_percent = meta.get("regularMarketChangePercent")
            as_of = meta.get("regularMarketTime")
            as_of_iso = (
                datetime.fromtimestamp(as_of, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                if as_of
                else None
            )
            history = self._build_equity_history(timestamps, closes)

            return {
                "price": price,
                "currency": meta.get("currency"),
                "change_percent": float(change_percent) if change_percent is not None else None,
                "as_of": as_of_iso,
                "source": "Yahoo Finance",
                "asset_type": "equity",
                "history": history,
            }
        except Exception:
            pass

        # Fallback: Stooq daily CSV
        try:
            stooq_symbol = f"{symbol.lower()}.us"
            stooq_url = f"https://stooq.com/q/d/l/?s={stooq_symbol}&i=d"
            response = httpx.get(stooq_url, headers=self.DEFAULT_HEADERS, timeout=2.5)
            response.raise_for_status()

            rows = list(csv.DictReader(StringIO(response.text)))
            rows = [row for row in rows if row.get("Close") and row["Close"] != "N/D"]
            if not rows:
                raise ValueError("No Stooq rows available")

            history = []
            for row in rows[-30:]:
                history.append(
                    {
                        "timestamp": f"{row['Date']}T00:00:00Z",
                        "close": float(row["Close"]),
                    }
                )

            latest = history[-1]["close"]
            previous = history[-2]["close"] if len(history) > 1 else None
            change_percent = ((latest - previous) / previous * 100) if previous else None

            return {
                "price": latest,
                "currency": "USD",
                "change_percent": round(change_percent, 2) if change_percent is not None else None,
                "as_of": history[-1]["timestamp"],
                "source": "Stooq",
                "asset_type": "equity",
                "history": history,
            }
        except Exception:
            return {
                "price": None,
                "currency": None,
                "change_percent": None,
                "as_of": None,
                "source": "Market data unavailable",
                "asset_type": "equity",
                "history": [],
            }

    def _build_equity_history(self, timestamps: list[Any], closes: list[Any]) -> list[dict[str, Any]]:
        history: list[dict[str, Any]] = []
        for timestamp, close in zip(timestamps, closes):
            if timestamp is None or close is None:
                continue
            history.append(
                {
                    "timestamp": datetime.fromtimestamp(int(timestamp), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "close": float(close),
                }
            )
        return history

    def _build_crypto_history(self, symbol: str) -> list[dict[str, Any]]:
        binance_symbol = self.CRYPTO_BINANCE_SYMBOLS.get(symbol)
        if not binance_symbol:
            return []

        try:
            url = f"https://api.binance.com/api/v3/klines?symbol={binance_symbol}&interval=1d&limit=30"
            response = httpx.get(url, headers=self.DEFAULT_HEADERS, timeout=2.5)
            response.raise_for_status()
            klines = response.json()

            history: list[dict[str, Any]] = []
            for row in klines:
                open_time_ms = row[0]
                close_price = row[4]
                history.append(
                    {
                        "timestamp": datetime.fromtimestamp(float(open_time_ms) / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "close": float(close_price),
                    }
                )
            return history
        except Exception:
            return []

    def fetch_news(self, ticker: str) -> list[dict[str, Any]]:
        symbol = (ticker or "").strip().upper()
        search_term = f"{symbol} crypto" if self.is_crypto_ticker(symbol) else f"{symbol} stock"
        sources = [
            ("Google News", f"https://news.google.com/rss/search?q={search_term}&hl=en-US&gl=US&ceid=US:en"),
        ]
        collected: list[dict[str, Any]] = []

        for publisher, url in sources:
            try:
                response = httpx.get(url, headers=self.DEFAULT_HEADERS, timeout=2.5)
                response.raise_for_status()
                root = ET.fromstring(response.text)
                for item in root.findall(".//item")[:5]:
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

        unique: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in collected:
            url = item["url"]
            if url in seen:
                continue
            seen.add(url)
            unique.append(item)
        return unique[:5]

    def fetch_macro_context(self, ticker: str | None = None) -> dict[str, Any]:
        symbol = (ticker or "").strip().upper()
        is_crypto = self.is_crypto_ticker(symbol)
        if is_crypto:
            return {
                "volatility": "elevated",
                "market_volume": "strong",
                "btc_dominance": 50.0,
                "liquidity": "healthy but uneven",
                "macro_summary": "Crypto sentiment is being shaped by liquidity, policy expectations, and sector rotation; the market remains highly sensitive to large moves in the dominant assets.",
            }
        return {
            "volatility": "moderate to elevated",
            "market_volume": "mixed",
            "rates": "market-sensitive",
            "liquidity": "watch closely",
            "macro_summary": "Risk sentiment is driven by rates, liquidity, and sector-specific catalysts; no live macro feed was available in the current backend configuration.",
        }