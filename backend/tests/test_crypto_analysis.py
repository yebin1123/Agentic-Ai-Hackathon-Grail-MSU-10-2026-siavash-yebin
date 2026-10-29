"""Network-free tests. Synthetic prices below are test fixtures, never demo data."""
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routes.crypto_analysis import service
from app.schemas.crypto_analysis import CryptoAnalysisRequest, MarketSnapshot
from app.services.crypto_research import CryptoResearchService
from app.tools.crypto_data import CryptoDataProvider


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_catalog_and_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    assets = client.get("/api/v1/assets").json()["assets"]
    assert len(assets) == 8
    assert assets[0]["id"] == "bitcoin"
    assert not any(asset["symbol"] == "NVDA" for asset in assets)


@pytest.mark.parametrize("payload", [
    {"asset_id": "bitcoin"}, {"asset_id": "bitcoin", "question": "  "},
    {"asset_id": "bitcoin", "question": "a" * 1001},
    {"asset_id": "bitcoin", "question": "hi", "risk_tolerance": "high"},
])
def test_bad_request(client, payload):
    response = client.post("/api/v1/crypto-analysis", json=payload)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_unsupported_asset_and_timeframe(client, monkeypatch):
    request = httpx.Request("GET", "https://api.coingecko.com/api/v3/coins/not-a-coin")
    not_found = httpx.HTTPStatusError("not found", request=request, response=httpx.Response(404, request=request))
    monkeypatch.setattr(service.provider, "get", AsyncMock(side_effect=not_found))
    assert client.post("/api/v1/crypto-analysis", json={"asset_id": "NVDA", "question": "Analyze"}).status_code == 400
    assert client.get("/api/v1/crypto-history/bitcoin?timeframe=5y").status_code == 400
    assert client.get("/api/v1/crypto-history/not-a-coin").status_code == 400
    assert client.post("/api/v1/stock-analysis").status_code == 410


def test_partial_data_no_nullable_format_crash(client, monkeypatch):
    monkeypatch.setattr(service.provider, "snapshot", AsyncMock(return_value=(MarketSnapshot(price_usd=10, market_cap_usd=1000, fully_diluted_valuation_usd=None, volume_24h_usd=None), [])))
    monkeypatch.setattr(service.provider, "news", AsyncMock(return_value=([], ["No news."])))
    response = client.post("/api/v1/crypto-analysis", json={"asset_id": "bitcoin", "question": "growth, valuation and risks"})
    assert response.status_code == 200
    body = response.json()
    assert body["analysis_mode"] == "deterministic"
    assert body["submitted_question"] == "growth, valuation and risks"
    assert body["answer_sections"]
    assert all(section["status"] in {"answered", "limited", "unsupported"} for section in body["answer_sections"])
    assert body["asset"]["symbol"] == "BTC"
    assert body["market_snapshot"]["volume_24h_usd"] is None
    assert any("no AI model" in w for w in body["meta"]["warnings"])
    assert all(r["severity"] == "unknown" for r in body["risks"])


def test_question_changes_topics():
    async def run():
        research = CryptoResearchService()
        research.provider.snapshot = AsyncMock(return_value=(MarketSnapshot(), []))
        research.provider.news = AsyncMock(return_value=([], []))
        supply = await research.analyze(CryptoAnalysisRequest(asset_id="bitcoin", question="token supply and dilution"), "test")
        liquidity = await research.analyze(CryptoAnalysisRequest(asset_id="bitcoin", question="liquidity and volume"), "test")
        assert any(point.category == "tokenomics" for point in supply.key_points)
        assert not any(point.category == "tokenomics" for point in liquidity.key_points)
    asyncio.run(run())


def research_fixture(snapshot):
    research = CryptoResearchService()
    research.provider.snapshot = AsyncMock(return_value=(snapshot, []))
    research.provider.news = AsyncMock(return_value=([], []))
    return research


def test_question_changes_main_answer_and_echoes_request():
    async def run():
        research = research_fixture(MarketSnapshot(price_usd=10, change_24h_percent=-2,
            circulating_supply=100, max_supply=200, market_cap_usd=1000,
            fully_diluted_valuation_usd=2000, volume_24h_usd=250,
            volume_scope="synthetic aggregate fixture", source="test provider"))
        responses = []
        for question in ("What is the 24-hour price change?", "Supply and valuation", "Trading volume and liquidity"):
            responses.append(await research.analyze(CryptoAnalysisRequest(asset_id="bitcoin", question=question), "test"))
        assert len({r.answer for r in responses}) == 3
        assert responses[0].submitted_question == "What is the 24-hour price change?"
        assert "$10.00" in responses[0].answer and "-2.00%" in responses[0].answer
        assert [s.topic for s in responses[0].answer_sections] == ["market"]
        assert "100 BTC" in responses[1].answer and "0.50" in responses[1].answer
        assert "$250.00" in responses[2].answer and "synthetic aggregate fixture" in responses[2].answer
        assert "order-book" in responses[2].answer.lower()
    asyncio.run(run())


@pytest.mark.parametrize("question,topic", [
    ("Will the price rise tomorrow?", "forecast"),
    ("Why did the price fall?", "causes"),
    ("Has the smart contract been audited?", "security"),
    ("What is the next unlock date?", "unlocks"),
    ("Is adoption growing?", "adoption"),
    ("What is Chainlink?", "adoption"),
    ("Compare LINK versus BTC", "comparison"),
    ("What is the weekly drawdown?", "history"),
    ("What is its legal status?", "regulation"),
])
def test_unconnected_questions_have_explicit_sections(question, topic):
    async def run():
        research = research_fixture(MarketSnapshot(price_usd=10))
        response = await research.analyze(CryptoAnalysisRequest(asset_id="chainlink", question=question), "test")
        section = next(s for s in response.answer_sections if s.topic == topic)
        assert section.status == "unsupported"
        assert section.limitation
        assert section.answer in response.answer
    asyncio.run(run())


@pytest.mark.parametrize("question", ["Tell me a joke", "escape routes and tradeoffs"])
def test_unknown_question_not_hidden_by_available_price(question):
    async def run():
        research = research_fixture(MarketSnapshot(price_usd=10))
        response = await research.analyze(CryptoAnalysisRequest(asset_id="bitcoin", question=question), "test")
        assert [s.topic for s in response.answer_sections] == ["scope"]
        assert response.answer_sections[0].status == "unsupported"
    asyncio.run(run())


def test_multi_topic_sections_unique_and_deterministic():
    async def run():
        research = research_fixture(MarketSnapshot(price_usd=10, change_24h_percent=0))
        request = CryptoAnalysisRequest(asset_id="bitcoin", question="Price, prices, volume, liquidity, supply and dilution risks; why did it change?")
        one = await research.analyze(request, "one")
        two = await research.analyze(request, "two")
        topics = [s.topic for s in one.answer_sections]
        assert topics == ["market", "liquidity", "tokenomics", "risk", "causes"]
        assert len(topics) == len(set(topics))
        assert one.answer == two.answer
        assert one.answer_sections == two.answer_sections
        assert "+0.00%" in one.answer
    asyncio.run(run())


def test_supply_evidence_survives_missing_price_and_zero_fdv():
    async def run():
        research = research_fixture(MarketSnapshot(circulating_supply=0, market_cap_usd=0, fully_diluted_valuation_usd=0))
        response = await research.analyze(CryptoAnalysisRequest(asset_id="bitcoin", question="Supply and valuation"), "test")
        assert "0 BTC" in response.answer and "$0.00" in response.answer
        assert "Market cap / FDV:" not in response.answer
        assert "unavailable maximum does not establish unlimited" in response.answer
        assert "no price, momentum or valuation conclusion" not in response.answer
    asyncio.run(run())


def test_answer_fallback_volume_does_not_become_global_usd():
    async def run():
        research = research_fixture(MarketSnapshot(price_usd=10, source="Coinbase Exchange",
            volume_scope="Exchange-specific; USD traded volume not available from this endpoint"))
        response = await research.analyze(CryptoAnalysisRequest(asset_id="bitcoin", question="Volume and liquidity"), "test")
        assert "unavailable" in response.answer and "Exchange-specific" in response.answer
        assert "missing volume is not zero" in response.answer
        assert response.answer_sections[0].status == "limited"
    asyncio.run(run())


def test_missing_providers_are_disclosed():
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock(side_effect=httpx.ConnectError("offline"))
        snapshot, warnings = await provider.snapshot("bitcoin")
        assert snapshot.price_usd is None
        assert len(warnings) >= 2
        history = await provider.history("bitcoin", "1y")
        assert history.points == []
        assert history.period_change_percent is None
        assert any("No synthetic chart" in w for w in history.warnings)
    asyncio.run(run())


def test_coinbase_fallback_does_not_invent_usd_volume_or_timestamp():
    async def run():
        provider = CryptoDataProvider()
        async def fake_get(url, *args, **kwargs):
            if "coingecko" in url:
                raise httpx.ConnectError("offline")
            return {"last": "100", "open": "80", "high": "105", "low": "79", "volume": "1000"}
        provider.get = fake_get
        snapshot, warnings = await provider.snapshot("bitcoin")
        assert snapshot.price_usd == 100
        assert snapshot.change_24h_percent == 25
        assert snapshot.volume_24h_usd is None
        assert snapshot.as_of is None
        assert "coinbase" in snapshot.source_url
        assert snapshot.market_cap_usd is None
        assert any("one Coinbase" in w for w in warnings)
    asyncio.run(run())


@pytest.mark.parametrize("frame,days", [("1d", 1), ("1w", 7), ("1m", 30), ("1y", 365)])
def test_history_timeframes_and_metrics(frame, days):
    async def run():
        provider = CryptoDataProvider()
        now = datetime.now(timezone.utc).timestamp()
        # Unsorted points and duplicate timestamp verify deduplication/order.
        provider.get = AsyncMock(return_value={"prices": [
            [(now - 10) * 1000, 80], [(now - days * 86400 + 60) * 1000, 100],
            [(now - 20) * 1000, 120], [(now - 10) * 1000, 80], [now * 1000, None],
        ]})
        history = await provider.history("bitcoin", frame)
        assert len(history.points) == 3
        assert history.points[0].price == 100
        assert history.period_change_percent == pytest.approx(-20)
        assert history.max_drawdown_percent == pytest.approx(-100 / 3)
        assert provider.get.call_args.args[1]["days"] == days
    asyncio.run(run())


def test_one_year_coinbase_chunks_bounded_and_parallel():
    async def run():
        provider = CryptoDataProvider()
        requests = []
        async def fake_get(url, params=None, *args, **kwargs):
            if "coingecko" in url:
                raise httpx.ConnectError("offline")
            requests.append(params)
            start = datetime.fromisoformat(params["start"]).timestamp()
            return [[start, 70, 100, 80, 90, 1000]]
        provider.get = fake_get
        history = await provider.history("bitcoin", "1y")
        assert len(requests) == 2
        for request in requests:
            seconds = (datetime.fromisoformat(request["end"]) - datetime.fromisoformat(request["start"])).total_seconds()
            assert seconds / request["granularity"] <= 280
        assert history.source == "Coinbase Exchange"
        assert all(point.price == 90 for point in history.points)
    asyncio.run(run())


def test_cache_collapses_duplicate_requests():
    async def run():
        provider = CryptoDataProvider()
        calls = 0
        async def load():
            nonlocal calls
            calls += 1
            await asyncio.sleep(0.01)
            return {"value": 10}
        results = await asyncio.gather(*(provider.cached("same", load, 60) for _ in range(5)))
        assert calls == 1
        assert all(result == {"value": 10} for result in results)
    asyncio.run(run())


def test_news_url_publisher_and_iso_timestamp():
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock(return_value='''<rss><channel>
        <item><title>Bitcoin protocol update</title><link>https://news.example.test/article</link><source>Test publisher</source><pubDate>Sat, 17 Oct 2026 12:00:00 GMT</pubDate></item>
        <item><title>Missing link</title><guid>not-a-url</guid></item>
        </channel></rss>''')
        sources, _ = await provider.news("bitcoin")
        assert len(sources) == 1
        assert sources[0].publisher == "Test publisher"
        assert sources[0].published_at == "2026-10-17T12:00:00Z"
    asyncio.run(run())


def test_malformed_provider_json_is_a_safe_partial_response():
    async def run():
        provider = CryptoDataProvider()
        provider.get = AsyncMock(return_value=[None])
        snapshot, warnings = await provider.snapshot("bitcoin")
        assert snapshot.price_usd is None
        assert warnings
        history = await provider.history("bitcoin", "1d")
        assert history.points == []
        assert history.warnings
    asyncio.run(run())
