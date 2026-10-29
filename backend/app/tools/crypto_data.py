"""Crypto-only retrieval. No invented prices, macro context, or volatility."""
import asyncio
import copy
import logging
import math
import os
import re
import time
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

import httpx

from app.schemas.crypto_analysis import Asset, HistoryResponse, MarketSnapshot, PricePoint, Source

logger = logging.getLogger(__name__)

# Explicit IDs avoid ambiguous symbols and accidental equity lookups.
ASSETS = {
    "bitcoin": ("BTC", "Bitcoin", "Monetary network"),
    "ethereum": ("ETH", "Ethereum", "Smart-contract network"),
    "solana": ("SOL", "Solana", "Smart-contract network"),
    "chainlink": ("LINK", "Chainlink", "Oracle infrastructure"),
    "avalanche-2": ("AVAX", "Avalanche", "Smart-contract network"),
    "dogecoin": ("DOGE", "Dogecoin", "Community / payments"),
    "cardano": ("ADA", "Cardano", "Smart-contract network"),
    "ripple": ("XRP", "XRP", "Payments network"),
}
# Manually curated CoinGecko ID -> Coinbase Exchange USD product crosswalk.
# These eight identities/products are explicit; never derive a product from a ticker.
COINBASE_PRODUCTS = {
    "bitcoin": "BTC-USD", "ethereum": "ETH-USD", "solana": "SOL-USD",
    "chainlink": "LINK-USD", "avalanche-2": "AVAX-USD", "dogecoin": "DOGE-USD",
    "cardano": "ADA-USD", "ripple": "XRP-USD",
}
MAX_CACHE_ENTRIES = 128
CANONICAL_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,79}", re.ASCII)
DAYS = {"1d": 1, "1w": 7, "1m": 30, "1y": 365}
GRANULARITY = {"1d": 900, "1w": 3600, "1m": 21600, "1y": 86400}


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def number(value):
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError, OverflowError):
        return None


def nonnegative_number(value):
    result = number(value)
    return result if result is not None and result >= 0 else None


def timestamp(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if dt.tzinfo else None
    except (ValueError, TypeError):
        return None


def get_asset(asset_id):
    symbol, name, category = ASSETS[asset_id]
    return Asset(id=asset_id, symbol=symbol, name=name, category=category)


class UnknownAsset(ValueError):
    """Invalid canonical ID or a confirmed CoinGecko identity 404."""


class ProviderUnavailable(RuntimeError):
    """Provider failure is not evidence that an asset does not exist."""


class AssetResolutionUnavailable(ProviderUnavailable):
    pass


def validate_asset_id(asset_id):
    if not isinstance(asset_id, str) or not CANONICAL_ID.fullmatch(asset_id):
        raise UnknownAsset("Use a lowercase canonical CoinGecko coin ID, not a ticker or contract address.")


class CryptoDataProvider:
    def __init__(self):
        self.client: httpx.AsyncClient | None = None
        self.cache = {}
        self.locks = {}

    async def cached(self, key, loader, ttl):
        # References include waiters: removing a lock while a waiter holds it
        # would allow a second lock/loader for the same key under concurrency.
        if key in self.cache and self.cache[key][0] > time.monotonic():
            return copy.deepcopy(self.cache[key][1])
        if key not in self.locks:
            if len(self.locks) >= MAX_CACHE_ENTRIES:
                raise ProviderUnavailable("Too many concurrent provider lookups; retry shortly.")
            self.locks[key] = [asyncio.Lock(), 0]
        entry = self.locks[key]
        entry[1] += 1
        try:
            async with entry[0]:
                if key in self.cache and self.cache[key][0] > time.monotonic():
                    return copy.deepcopy(self.cache[key][1])
                result = await loader()
                if len(self.cache) >= MAX_CACHE_ENTRIES:
                    self.cache.pop(next(iter(self.cache)))
                self.cache[key] = (time.monotonic() + ttl, copy.deepcopy(result))
                return result
        finally:
            entry[1] -= 1
            if entry[1] == 0:
                del self.locks[key]

    async def get(self, url, params=None, headers=None, json=True):
        # wait_for supplies a wall-clock deadline, not only a per-read timeout.
        async def request(client):
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json() if json else response.text
        try:
            if self.client is not None:
                return await asyncio.wait_for(request(self.client), timeout=4)
            async with httpx.AsyncClient(timeout=3, headers={"User-Agent": "FinCryptoResearch/0.2"}) as client:
                return await asyncio.wait_for(request(client), timeout=4)
        except httpx.HTTPStatusError as exc:
            logger.warning("Crypto provider %s returned HTTP %s", exc.request.url.host, exc.response.status_code)
            raise
        except (httpx.HTTPError, TimeoutError):
            logger.warning("Crypto provider request failed for %s", httpx.URL(url).host)
            raise

    def gecko_config(self):
        pro = os.getenv("COINGECKO_PRO_API_KEY")
        demo = os.getenv("COINGECKO_DEMO_API_KEY")
        if pro:
            return "https://pro-api.coingecko.com/api/v3", {"x-cg-pro-api-key": pro}
        return "https://api.coingecko.com/api/v3", ({"x-cg-demo-api-key": demo} if demo else {})

    def identity(self, data, asset_id, warnings=None):
        validate_asset_id(asset_id)
        if not isinstance(data, dict) or data.get("id") != asset_id:
            raise ValueError("Mismatched or malformed CoinGecko identity")
        symbol, name = data.get("symbol"), data.get("name")
        if not isinstance(symbol, str) or not symbol.strip() or not isinstance(name, str) or not name.strip():
            raise ValueError("Missing CoinGecko identity fields")
        raw_platforms = data.get("platforms")
        platforms = {}
        invalid_metadata = False
        if raw_platforms is not None:
            if not isinstance(raw_platforms, dict):
                invalid_metadata = True
            else:
                for chain, contract in raw_platforms.items():
                    if contract is None or contract == "":
                        continue
                    if not isinstance(chain, str) or not chain.strip() or not isinstance(contract, str):
                        invalid_metadata = True
                        continue
                    if contract.strip():
                        platforms[chain] = contract
        categories = data.get("categories", [])
        category = "Crypto asset"
        if asset_id in ASSETS:
            category = ASSETS[asset_id][2]
        elif isinstance(categories, list):
            category = next((c for c in categories if isinstance(c, str) and c.strip()), category)
        if invalid_metadata:
            warning = "Optional CoinGecko contract metadata was malformed; invalid fields were omitted."
            logger.warning("%s Asset ID: %s", warning, asset_id)
            if warnings is not None:
                warnings.append(warning)
        return Asset(id=asset_id, symbol=symbol.upper(), name=name, category=category,
                     platforms=platforms, provider_url=f"https://www.coingecko.com/en/coins/{asset_id}")

    async def resolve_asset(self, asset_id, *, full_metadata=False):
        validate_asset_id(asset_id)
        key = ("identity", asset_id)
        # Featured identities remain usable offline; detail requests explicitly
        # hydrate chain/contracts, and subsequent retrievals use that metadata.
        if not full_metadata and asset_id in ASSETS and key not in self.cache:
            return get_asset(asset_id)
        return await self.cached(key, lambda: self._resolve_asset(asset_id), 3600)

    async def _resolve_asset(self, asset_id):
        base, headers = self.gecko_config()
        try:
            data = await self.get(f"{base}/coins/{asset_id}", {
                "localization": "false", "tickers": "false", "market_data": "false",
                "community_data": "false", "developer_data": "false",
            }, headers)
            return self.identity(data, asset_id)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise UnknownAsset("CoinGecko has no asset with this canonical ID.") from exc
            raise AssetResolutionUnavailable("CoinGecko asset resolution is unavailable; retry shortly.") from exc
        except (httpx.HTTPError, TimeoutError, ValueError, TypeError):
            raise AssetResolutionUnavailable("CoinGecko asset resolution is unavailable; retry shortly.")

    async def search_assets(self, query):
        query = query.strip()
        if not 2 <= len(query) <= 100:
            raise ValueError("Search query must contain 2 to 100 characters.")
        return await self.cached(("search", query.casefold()), lambda: self._search_assets(query), 60)

    async def _search_assets(self, query):
        base, headers = self.gecko_config()
        try:
            data = await self.get(f"{base}/search", {"query": query}, headers)
            if not isinstance(data, dict) or not isinstance(data.get("coins"), list):
                raise ValueError("Malformed CoinGecko search")
            assets, warnings, seen = [], [], set()
            for coin in data["coins"]:
                try:
                    candidate = self.identity(coin, coin.get("id") if isinstance(coin, dict) else None, warnings)
                except (ValueError, TypeError):
                    warnings.append("Some provider search candidates had invalid identity metadata and were omitted.")
                    continue
                if candidate.id not in seen:
                    assets.append(candidate)
                    seen.add(candidate.id)
                if len(assets) == 20:
                    break
            return {"assets": assets, "warnings": list(dict.fromkeys(warnings))}
        except (httpx.HTTPError, TimeoutError, ValueError, TypeError):
            raise ProviderUnavailable("CoinGecko asset search is unavailable; retry shortly.")

    async def snapshot(self, asset_id):
        await self.resolve_asset(asset_id)
        return await self.cached(("snapshot", asset_id), lambda: self._snapshot(asset_id), 60)

    async def _snapshot(self, asset_id):
        base, headers = self.gecko_config()
        warnings = []
        try:
            data = await self.get(f"{base}/coins/markets", {"ids": asset_id, "vs_currency": "usd"}, headers)
            if not isinstance(data, list) or not data or not isinstance(data[0], dict):
                raise ValueError("Malformed aggregate snapshot")
            entry = data[0]
            if entry.get("id") != asset_id:
                raise ValueError("Mismatched aggregate identity")
            price = number(entry.get("current_price"))
            if price is None or price <= 0:
                raise ValueError("Missing price")
            snap = MarketSnapshot(
                price_usd=price, change_24h_percent=number(entry.get("price_change_percentage_24h")),
                market_cap_usd=nonnegative_number(entry.get("market_cap")),
                fully_diluted_valuation_usd=nonnegative_number(entry.get("fully_diluted_valuation")),
                volume_24h_usd=nonnegative_number(entry.get("total_volume")),
                volume_scope="CoinGecko aggregated 24h reported trading volume",
                circulating_supply=nonnegative_number(entry.get("circulating_supply")), max_supply=nonnegative_number(entry.get("max_supply")),
                high_24h_usd=nonnegative_number(entry.get("high_24h")), low_24h_usd=nonnegative_number(entry.get("low_24h")),
                ath_change_percent=number(entry.get("ath_change_percentage")),
                source="CoinGecko", source_url=f"https://www.coingecko.com/en/coins/{asset_id}",
                as_of=timestamp(entry.get("last_updated")), retrieved_at=utc_now(),
            )
            if snap.as_of:
                age = datetime.now(timezone.utc) - datetime.fromisoformat(snap.as_of.replace("Z", "+00:00"))
                if age > timedelta(minutes=15):
                    warnings.append("The aggregated quote is older than 15 minutes; check its timestamp.")
            else:
                warnings.append("CoinGecko did not supply a valid quote timestamp.")
            return snap, warnings
        except (httpx.HTTPError, TimeoutError, ValueError, KeyError, IndexError, TypeError):
            warnings.append("CoinGecko aggregate metrics unavailable. Rate limits, network access, or API-tier restrictions may apply.")

        product = COINBASE_PRODUCTS.get(asset_id)
        if product is None:
            warnings.append("No verified Coinbase USD product mapping exists for this asset. No reliable USD quote could be retrieved; missing metrics are not estimated.")
            return MarketSnapshot(retrieved_at=utc_now()), warnings
        try:
            stats = await self.get(f"https://api.exchange.coinbase.com/products/{product}/stats")
            if not isinstance(stats, dict):
                raise ValueError("Malformed exchange snapshot")
            price, opening = number(stats.get("last")), number(stats.get("open"))
            if not price or price <= 0:
                raise ValueError("Missing exchange price")
            # Base-unit volume is NOT global USD volume. Leave USD metric unknown.
            snap = MarketSnapshot(
                price_usd=price, change_24h_percent=((price / opening - 1) * 100) if opening and opening > 0 else None,
                high_24h_usd=nonnegative_number(stats.get("high")), low_24h_usd=nonnegative_number(stats.get("low")),
                source="Coinbase Exchange", source_url=f"https://exchange.coinbase.com/trade/{product}",
                retrieved_at=utc_now(), volume_scope="Exchange-specific; USD traded volume not available from this endpoint",
            )
            warnings.append("Fallback quote covers one Coinbase USD market, not the global crypto market. Quote event time is unavailable; retrieval time is shown separately.")
            return snap, warnings
        except (httpx.HTTPError, TimeoutError, ValueError, KeyError, TypeError):
            warnings.append("No reliable USD quote could be retrieved. Missing metrics are not estimated.")
            return MarketSnapshot(retrieved_at=utc_now()), warnings

    async def history(self, asset_id, timeframe):
        await self.resolve_asset(asset_id)
        return await self.cached(("history", asset_id, timeframe), lambda: self._history(asset_id, timeframe), 120 if timeframe == "1d" else 300)

    async def _history(self, asset_id, timeframe):
        base, headers = self.gecko_config()
        warnings = []
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=DAYS[timeframe])
        points = []
        source = source_url = sampling = None
        try:
            data = await self.get(f"{base}/coins/{asset_id}/market_chart", {"vs_currency": "usd", "days": DAYS[timeframe]}, headers)
            if not isinstance(data, dict) or not isinstance(data.get("prices"), list):
                raise ValueError("Malformed aggregate history")
            for row in data.get("prices", []):
                if not isinstance(row, list) or len(row) < 2:
                    continue
                epoch, price = number(row[0]), number(row[1])
                if epoch is not None and price is not None and price > 0 and start.timestamp() <= epoch / 1000 <= end.timestamp():
                    points.append(PricePoint(timestamp=datetime.fromtimestamp(epoch / 1000, timezone.utc).isoformat().replace("+00:00", "Z"), price=price))
            if not points:
                raise ValueError("No price samples")
            source, source_url, sampling = "CoinGecko", f"https://www.coingecko.com/en/coins/{asset_id}", "Provider-selected aggregated price samples (not exchange candles)"
        except (httpx.HTTPError, TimeoutError, ValueError, KeyError, TypeError, OverflowError):
            points = []
            product = COINBASE_PRODUCTS.get(asset_id)
            warnings.append("CoinGecko chart unavailable. One-year history may require a paid CoinGecko tier.")
            if product is None:
                warnings.append("No verified Coinbase USD product mapping exists for this asset; exchange fallback is disabled.")
            else:
                warnings.append("Attempting Coinbase Exchange USD candles.")
            step = GRANULARITY[timeframe]
            # Split one-year daily candles: Coinbase caps requests at 300 buckets.
            chunks = []
            cursor = start
            while product is not None and cursor < end:
                stop = min(cursor + timedelta(seconds=step * 280), end)
                chunks.append((cursor, stop))
                cursor = stop

            async def candles(chunk):
                return await self.get(f"https://api.exchange.coinbase.com/products/{product}/candles", {
                    "start": chunk[0].isoformat(), "end": chunk[1].isoformat(), "granularity": step,
                })

            batches = await asyncio.gather(*(candles(chunk) for chunk in chunks), return_exceptions=True)
            for batch in batches:
                if isinstance(batch, BaseException):
                    warnings.append("A Coinbase history segment could not be retrieved; chart coverage may be incomplete.")
                    continue
                if not isinstance(batch, list):
                    continue
                for row in batch:
                    if not isinstance(row, list) or len(row) < 5:
                        continue
                    epoch, price = number(row[0]), number(row[4])
                    # Exclude the still-open candle; timestamps label candle CLOSE time.
                    if epoch is not None and price is not None and price > 0:
                        close_time = epoch + step
                        if start.timestamp() <= close_time <= end.timestamp():
                            points.append(PricePoint(timestamp=datetime.fromtimestamp(close_time, timezone.utc).isoformat().replace("+00:00", "Z"), price=price))
            if points:
                source, source_url = "Coinbase Exchange", f"https://exchange.coinbase.com/trade/{product}"
                sampling = f"Completed {step // 60}-minute USD candle closes; single exchange"
                warnings.append("Exchange candles can have gaps when there are no trades. These are not aggregated global prices.")

        unique = {point.timestamp: point for point in points}
        points = sorted(unique.values(), key=lambda point: point.timestamp)
        change = drawdown = None
        if len(points) >= 2:
            change = (points[-1].price / points[0].price - 1) * 100
            peak = points[0].price
            drawdown = 0.0
            for point in points:
                peak = max(peak, point.price)
                drawdown = min(drawdown, (point.price / peak - 1) * 100)
            first = datetime.fromisoformat(points[0].timestamp.replace("Z", "+00:00"))
            last = datetime.fromisoformat(points[-1].timestamp.replace("Z", "+00:00"))
            if (last - first).total_seconds() < DAYS[timeframe] * 86400 * 0.85:
                warnings.append("Returned chart covers less than 85% of the requested window. Period metrics use only returned samples.")
            if (end - last).total_seconds() > max(GRANULARITY[timeframe] * 2, 3600):
                warnings.append("Latest history sample is older than expected for this timeframe.")
        elif points:
            warnings.append("Only one sample available; return and drawdown cannot be calculated.")
        else:
            warnings.append("Price history unavailable. No synthetic chart has been substituted.")
        return HistoryResponse(asset_id=asset_id, timeframe=timeframe, source=source, source_url=source_url,
            sampling=sampling, points=points, warnings=list(dict.fromkeys(warnings)), retrieved_at=utc_now(),
            coverage_start=points[0].timestamp if points else None, coverage_end=points[-1].timestamp if points else None,
            period_change_percent=change, max_drawdown_percent=drawdown)

    async def news(self, asset_id):
        await self.resolve_asset(asset_id)
        return await self.cached(("news", asset_id), lambda: self._news(asset_id), 300)

    async def _news(self, asset_id):
        name = (await self.resolve_asset(asset_id)).name
        # Headlines/links only; do not claim full articles were read or synthesised.
        try:
            text = await self.get("https://news.google.com/rss/search", {"q": f'"{name}" cryptocurrency when:7d', "hl": "en-US", "gl": "US", "ceid": "US:en"}, json=False)
            root = ET.fromstring(text)
            sources = []
            seen = set()
            for item in root.findall(".//item"):
                url = (item.findtext("link") or "").strip()
                title = (item.findtext("title") or "").strip()
                if not url.startswith(("https://", "http://")) or not title or url in seen:
                    continue
                published = None
                try:
                    dt = parsedate_to_datetime(item.findtext("pubDate") or "")
                    published = dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if dt.tzinfo else None
                except (ValueError, TypeError):
                    pass
                sources.append(Source(title=title, url=url, publisher=item.findtext("source") or "Publisher unavailable (Google News RSS)", published_at=published, source_type="news"))
                seen.add(url)
                if len(sources) == 5:
                    break
            return sources, ([] if sources else ["No recent news headlines returned."])
        except (httpx.HTTPError, TimeoutError, ET.ParseError, ValueError):
            return [], ["Crypto news headlines unavailable; no article evidence is being claimed."]
