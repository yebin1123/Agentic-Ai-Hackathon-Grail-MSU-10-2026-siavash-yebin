"""Canonical discovery fixtures; no live providers or automatic candidate choice."""
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routes.crypto_analysis import service
from app.schemas.crypto_analysis import CryptoAnalysisResponse, MarketSnapshot, Meta
from app.tools.crypto_data import (
    ASSETS, MAX_CACHE_ENTRIES, AssetResolutionUnavailable, CryptoDataProvider,
    ProviderUnavailable, UnknownAsset, number,
)


@pytest.fixture
def outside_asset():
    return {
        "id": "test-token", "symbol": "same", "name": "Test Token",
        "categories": ["Test category"],
        "platforms": {"ethereum": "0x123456", "polygon-pos": "0xabcdef"},
    }


@pytest.fixture
def ambiguous_candidates():
    return {"coins": [
        {"id": "test-token", "symbol": "same", "name": "Test Token"},
        {"id": "other-token", "symbol": "same", "name": "Other Token"},
    ]}


@pytest.fixture
def client(monkeypatch):
    provider = CryptoDataProvider()
    monkeypatch.setattr(service, "provider", provider)
    with TestClient(app) as client:
        yield client, provider


def test_search_uses_actual_endpoint_and_preserves_ambiguous_ids(ambiguous_candidates):
    async def run():
        calls = []
        def handler(request):
            calls.append(request)
            assert request.url.path == "/api/v3/search"
            assert request.url.params["query"] == "same"
            return httpx.Response(200, json=ambiguous_candidates)
        provider = CryptoDataProvider()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider.client = client
            result = await provider.search_assets("same")
            assert [a.id for a in result["assets"]] == ["test-token", "other-token"]
            assert all(a.symbol == "SAME" for a in result["assets"])
            assert set(result) == {"assets", "warnings"}
            assert result["warnings"] == []
            assert await provider.search_assets("SAME") == result
            assert len(calls) == 1
            assert not any(key[0] == "identity" for key in provider.cache)
    asyncio.run(run())


def test_search_bounded_candidates_and_cache():
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock(return_value={"coins": [
            {"id": f"token-{i}", "symbol": "same", "name": f"Token {i}"} for i in range(30)
        ]})
        assert len((await provider.search_assets("same"))["assets"]) == 20
        for i in range(150):
            await provider.search_assets(f"query-{i}")
        assert len(provider.cache) <= MAX_CACHE_ENTRIES
        assert not provider.locks
    asyncio.run(run())


def test_resolution_full_chain_contract_metadata_and_cache(outside_asset):
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock(return_value=outside_asset)
        result = await provider.resolve_asset("test-token")
        assert result.id not in ASSETS
        assert result.symbol == "SAME"
        assert result.category == "Test category"
        assert result.platforms == outside_asset["platforms"]
        assert result.provider_url == "https://www.coingecko.com/en/coins/test-token"
        assert provider.get.call_args.args[0].endswith("/coins/test-token")
        result.platforms["ethereum"] = "mutated"
        assert (await provider.resolve_asset("test-token")).platforms == outside_asset["platforms"]
        assert provider.get.await_count == 1
    asyncio.run(run())


def test_featured_resolution_offline_but_detail_fetches_full_metadata():
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock(return_value={
            "id": "ethereum", "symbol": "eth", "name": "Ethereum", "platforms": {"": ""},
        })
        featured = await provider.resolve_asset("ethereum")
        assert featured.symbol == "ETH"
        provider.get.assert_not_awaited()
        detail = await provider.resolve_asset("ethereum", full_metadata=True)
        assert detail.platforms == {}
        assert detail.provider_url.endswith("/ethereum")
        assert (await provider.resolve_asset("ethereum")) == detail
        assert provider.get.await_count == 1
    asyncio.run(run())


@pytest.mark.parametrize("asset_id", ["BTC", "Bitcoin", "../bitcoin", "bitcoin?x=1", "bitcoin/markets", "", "x" * 81, " btc ", "bitc\u043ein"])
def test_unsafe_ids_never_hit_network(asset_id):
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock()
        for method in (provider.resolve_asset, provider.snapshot, provider.news):
            with pytest.raises(UnknownAsset):
                await method(asset_id)
        with pytest.raises(UnknownAsset):
            await provider.history(asset_id, "1d")
        provider.get.assert_not_awaited()
    asyncio.run(run())


@pytest.mark.parametrize("status,exception", [(404, UnknownAsset), (429, AssetResolutionUnavailable), (500, AssetResolutionUnavailable)])
def test_missing_identity_is_not_provider_outage(status, exception):
    async def run():
        provider = CryptoDataProvider()
        def handler(request):
            return httpx.Response(status, json={"error": "fixture"})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider.client = client
            with pytest.raises(exception):
                await provider.resolve_asset("not-in-provider")
            assert not provider.cache
            assert not provider.locks
    asyncio.run(run())


def test_resolution_outage_is_not_cached_as_missing(outside_asset):
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock(side_effect=[httpx.ConnectError("offline"), outside_asset])
        with pytest.raises(AssetResolutionUnavailable):
            await provider.resolve_asset("test-token")
        assert (await provider.resolve_asset("test-token")).id == "test-token"
        assert provider.get.await_count == 2
    asyncio.run(run())


@pytest.mark.parametrize("data", [None, {}, {"id": "wrong", "symbol": "same", "name": "Wrong"}, {"id": "test-token", "name": "Missing symbol"}])
def test_malformed_resolution_is_unavailable_not_unknown(data):
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock(return_value=data)
        with pytest.raises(AssetResolutionUnavailable):
            await provider.resolve_asset("test-token")
    asyncio.run(run())


def test_no_coinbase_fallback_for_unmapped_asset_even_with_curated_ticker(outside_asset):
    async def run():
        provider = CryptoDataProvider()
        outside_asset["symbol"] = "btc"
        calls = []
        async def get(url, *args, **kwargs):
            calls.append(url)
            assert "coinbase" not in url
            if url.endswith("/coins/test-token"):
                return outside_asset
            raise httpx.ConnectError("offline")
        provider.get = get
        snapshot, warnings = await provider.snapshot("test-token")
        history = await provider.history("test-token", "1y")
        assert snapshot.price_usd is None
        assert history.points == []
        assert any("No verified Coinbase" in w for w in warnings)
        assert any("fallback is disabled" in w for w in history.warnings)
        assert len(calls) == 3
    asyncio.run(run())


def test_dynamic_snapshot_news_history_use_resolved_identity(outside_asset):
    async def run():
        provider = CryptoDataProvider()
        now = datetime.now(timezone.utc).timestamp()
        async def get(url, params=None, *args, **kwargs):
            if url.endswith("/coins/test-token"):
                return outside_asset
            if url.endswith("/coins/markets"):
                assert params == {"ids": "test-token", "vs_currency": "usd"}
                return [{"id": "test-token", "current_price": 10}]
            if url.endswith("/market_chart"):
                assert params["vs_currency"] == "usd"
                return {"prices": [[(now - 60) * 1000, 10]]}
            assert '"Test Token" cryptocurrency' in params["q"]
            return "<rss><channel/></rss>"
        provider.get = get
        assert (await provider.snapshot("test-token"))[0].price_usd == 10
        assert (await provider.history("test-token", "1d")).currency == "USD"
        assert (await provider.news("test-token"))[0] == []
    asyncio.run(run())


def test_search_detail_routes_and_featured_backward_compatibility(client, outside_asset, ambiguous_candidates):
    client, provider = client
    async def get(url, *args, **kwargs):
        return ambiguous_candidates if url.endswith("/search") else outside_asset
    provider.get = get
    assert len(client.get("/api/v1/assets").json()["assets"]) == 8
    body = client.get("/api/v1/assets/search?q=same").json()
    assert [a["id"] for a in body["assets"]] == ["test-token", "other-token"]
    assert set(body) == {"assets", "warnings"}
    body = client.get("/api/v1/assets/test-token").json()
    assert body["asset"]["platforms"] == outside_asset["platforms"]


@pytest.mark.parametrize("query", ["", "a", " " * 2, "x" * 101])
def test_search_query_validation(client, query):
    client, provider = client
    provider.get = AsyncMock()
    assert client.get("/api/v1/assets/search", params={"q": query}).status_code == 400
    provider.get.assert_not_awaited()


def test_search_outage_not_empty_success_or_default(client):
    client, provider = client
    provider.get = AsyncMock(side_effect=httpx.ConnectError("offline"))
    response = client.get("/api/v1/assets/search?q=same")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "PROVIDER_UNAVAILABLE"
    assert "assets" not in response.json()


def test_zero_results_do_not_select_featured_default(client):
    client, provider = client
    provider.get = AsyncMock(return_value={"coins": []})
    assert client.get("/api/v1/assets/search?q=missing").json() == {"assets": [], "warnings": []}


@pytest.mark.parametrize("exception,status,code", [
    (UnknownAsset("not found"), 400, "UNKNOWN_ASSET"),
    (AssetResolutionUnavailable("offline"), 503, "ASSET_RESOLUTION_UNAVAILABLE"),
])
def test_route_resolution_errors(client, monkeypatch, exception, status, code):
    client, provider = client
    provider.resolve_asset = AsyncMock(side_effect=exception)
    mocked_analyze = AsyncMock()
    monkeypatch.setattr(service, "analyze", mocked_analyze)
    responses = [
        client.get("/api/v1/assets/test-token"),
        client.get("/api/v1/crypto-history/test-token"),
        client.post("/api/v1/crypto-analysis", json={"asset_id": "test-token", "question": "Price?"}),
    ]
    assert all(r.status_code == status and r.json()["error"]["code"] == code for r in responses)
    mocked_analyze.assert_not_awaited()


def test_analysis_route_accepts_dynamic_canonical_id(client, outside_asset, monkeypatch):
    client, provider = client
    provider.get = AsyncMock(return_value=outside_asset)
    async def analyze(request, request_id):
        asset = await provider.resolve_asset(request.asset_id)
        return CryptoAnalysisResponse(request_id=request_id, asset=asset, submitted_question=request.question,
            answer="Fixture", market_snapshot=MarketSnapshot(), key_points=[], risks=[], sources=[],
            meta=Meta(generated_at="2026-10-01T00:00:00Z"))
    monkeypatch.setattr(service, "analyze", analyze)
    response = client.post("/api/v1/crypto-analysis", json={"asset_id": "test-token", "question": "Price?"})
    assert response.status_code == 200
    assert response.json()["asset"]["id"] == "test-token"


def test_inflight_locks_remain_bounded_and_cleanup_on_failure_and_cancellation():
    async def run():
        provider = CryptoDataProvider()
        release = asyncio.Event()
        async def load():
            await release.wait()
            return {"value": 1}
        tasks = [asyncio.create_task(provider.cached(i, load, 60)) for i in range(MAX_CACHE_ENTRIES)]
        await asyncio.sleep(0)
        assert len(provider.locks) == MAX_CACHE_ENTRIES
        with pytest.raises(ProviderUnavailable):
            await provider.cached("overflow", load, 60)
        tasks[0].cancel()
        await asyncio.gather(tasks[0], return_exceptions=True)
        assert len(provider.locks) == MAX_CACHE_ENTRIES - 1
        release.set()
        await asyncio.gather(*tasks[1:])
        assert not provider.locks
        async def fail():
            raise ValueError("fixture")
        with pytest.raises(ValueError):
            await provider.cached("failure", fail, 60)
        assert not provider.locks
    asyncio.run(run())


def test_cancelled_lock_owner_does_not_orphan_existing_waiters():
    async def run():
        provider = CryptoDataProvider()
        release = asyncio.Event()
        calls = 0
        async def load():
            nonlocal calls
            calls += 1
            await release.wait()
            return {"value": calls}
        owner = asyncio.create_task(provider.cached("same", load, 60))
        waiter = asyncio.create_task(provider.cached("same", load, 60))
        await asyncio.sleep(0)
        owner.cancel()
        await asyncio.gather(owner, return_exceptions=True)
        newcomer = asyncio.create_task(provider.cached("same", load, 60))
        await asyncio.sleep(0)
        release.set()
        a, b = await asyncio.gather(waiter, newcomer)
        assert a == b == {"value": 2}
        assert calls == 2
        assert not provider.locks
    asyncio.run(run())


@pytest.mark.parametrize("row", [
    {"current_price": 123456789, "market_cap": 987654321},
    {"id": None, "current_price": 123456789, "market_cap": 987654321},
    {"id": "other-token", "current_price": 123456789, "market_cap": 987654321},
])
def test_unattributed_market_rows_not_snapshot_or_chat_evidence(outside_asset, row):
    async def run():
        from app.services.crypto_chat import CryptoChatService

        provider = CryptoDataProvider()
        provider.get = AsyncMock(side_effect=[outside_asset, [row]])
        provider.news = AsyncMock(return_value=([], []))
        snapshot, warnings = await provider.snapshot("test-token")
        assert snapshot.price_usd is None
        assert snapshot.market_cap_usd is None
        assert snapshot.source is None and snapshot.source_url is None
        assert warnings
        asset, evidence, evidence_warnings = await CryptoChatService(provider).evidence("test-token")
        assert asset["id"] == "test-token"
        assert evidence == []
        assert evidence_warnings
        # evidence() is retrieval-only: no hosted model request or paid call.
        assert provider.get.await_count == 2
    asyncio.run(run())


@pytest.mark.parametrize("value", [True, False, float("nan"), float("inf"), "-inf", None])
def test_number_rejects_boolean_and_nonfinite_values(value):
    assert number(value) is None


@pytest.mark.parametrize("value", [-1, "-2.5", True, False, float("nan"), float("inf"), None])
def test_snapshot_invalid_nonnegative_quantities_are_missing(outside_asset, value):
    async def run():
        provider = CryptoDataProvider()
        row = {"id": "test-token", "current_price": 10,
               "price_change_percentage_24h": -12.5, "ath_change_percentage": -75}
        row.update({field: value for field in (
            "market_cap", "fully_diluted_valuation", "total_volume",
            "circulating_supply", "max_supply", "high_24h", "low_24h",
        )})
        provider.get = AsyncMock(side_effect=[outside_asset, [row]])
        snapshot, _ = await provider.snapshot("test-token")
        assert snapshot.price_usd == 10
        assert snapshot.change_24h_percent == -12.5
        assert snapshot.ath_change_percent == -75
        assert all(getattr(snapshot, field) is None for field in (
            "market_cap_usd", "fully_diluted_valuation_usd", "volume_24h_usd",
            "circulating_supply", "max_supply", "high_24h_usd", "low_24h_usd",
        ))
    asyncio.run(run())


def test_snapshot_zero_quantities_preserved_and_boolean_change_rejected(outside_asset):
    async def run():
        provider = CryptoDataProvider()
        row = {"id": "test-token", "current_price": 10,
               "price_change_percentage_24h": True, "ath_change_percentage": False}
        row.update({field: 0 for field in (
            "market_cap", "fully_diluted_valuation", "total_volume",
            "circulating_supply", "max_supply", "high_24h", "low_24h",
        )})
        provider.get = AsyncMock(side_effect=[outside_asset, [row]])
        snapshot, _ = await provider.snapshot("test-token")
        assert snapshot.change_24h_percent is None and snapshot.ath_change_percent is None
        assert all(getattr(snapshot, field) == 0 for field in (
            "market_cap_usd", "fully_diluted_valuation_usd", "volume_24h_usd",
            "circulating_supply", "max_supply", "high_24h_usd", "low_24h_usd",
        ))
    asyncio.run(run())


@pytest.mark.parametrize("price", [True, False, -10, 0, float("inf")])
def test_invalid_price_is_not_attributed_to_canonical_asset(outside_asset, price):
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock(side_effect=[outside_asset, [{"id": "test-token", "current_price": price}]])
        snapshot, warnings = await provider.snapshot("test-token")
        assert snapshot.price_usd is None and snapshot.source_url is None
        assert warnings
    asyncio.run(run())


def test_coinbase_negative_high_low_rejected_but_negative_return_retained():
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock(side_effect=[httpx.ConnectError("offline"),
            {"last": "80", "open": "100", "high": "-1", "low": False}])
        snapshot, _ = await provider.snapshot("bitcoin")
        assert snapshot.price_usd == 80
        assert snapshot.change_24h_percent == pytest.approx(-20)
        assert snapshot.high_24h_usd is None and snapshot.low_24h_usd is None
    asyncio.run(run())


def test_history_rejects_boolean_and_nonpositive_samples(outside_asset):
    async def run():
        provider = CryptoDataProvider()
        now = datetime.now(timezone.utc).timestamp() * 1000
        provider.get = AsyncMock(side_effect=[outside_asset, {"prices": [
            [now - 6000, True], [now - 5000, False], [now - 4000, -1],
            [now - 3000, 0], [True, 20], [now - 2000, 10],
        ]}])
        history = await provider.history("test-token", "1d")
        assert [p.price for p in history.points] == [10]
    asyncio.run(run())


@pytest.mark.parametrize("platforms,expected,warning", [
    (None, {}, False),
    ({}, {}, False),
    ({"": "", "ethereum": None, "polygon-pos": "  "}, {}, False),
    ({"ethereum": "0x123456", "polygon-pos": None, "solana": ""}, {"ethereum": "0x123456"}, False),
    ({"ethereum": "0x123456", "bad-chain": 123, "other-chain": False}, {"ethereum": "0x123456"}, True),
    ({"": "0x123456", 123: "0xabcdef"}, {}, True),
    (["0x123456"], {}, True),
])
def test_optional_contract_metadata_never_invents_or_discards_identity(outside_asset, platforms, expected, warning, caplog):
    async def run():
        provider = CryptoDataProvider()
        metadata = {**outside_asset, "platforms": platforms, "categories": {"invalid": "category"}}
        provider.get = AsyncMock(side_effect=[metadata, {"coins": [metadata]}])
        asset = await provider.resolve_asset("test-token")
        assert asset.id == "test-token" and asset.symbol == "SAME"
        assert asset.platforms == expected
        assert asset.category == "Crypto asset"
        search = await provider.search_assets("same")
        assert search["assets"][0].id == "test-token"
        assert search["assets"][0].platforms == expected
        assert bool(search["warnings"]) is warning
        assert ("invalid fields were omitted" in caplog.text) is warning
    asyncio.run(run())


def test_absent_platforms_are_empty_without_guessing_chain(outside_asset):
    async def run():
        provider = CryptoDataProvider()
        outside_asset.pop("platforms")
        outside_asset["asset_platform_id"] = "ethereum"
        provider.get = AsyncMock(return_value=outside_asset)
        asset = await provider.resolve_asset("test-token")
        assert asset.platforms == {}
    asyncio.run(run())
