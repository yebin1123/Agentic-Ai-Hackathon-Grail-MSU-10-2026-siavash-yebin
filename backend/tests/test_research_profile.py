"""Qualitative profiles and attributed, data-dependent arguments (synthetic fixtures)."""
import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.routes.crypto_analysis import service
from app.schemas.crypto_analysis import CryptoAnalysisRequest, MarketSnapshot
from app.schemas.research_profile import ResearchProfile
from app.services.crypto_research import CryptoResearchService


def fixture_service(snapshot):
    research = CryptoResearchService()
    research.provider.snapshot = AsyncMock(return_value=(snapshot, []))
    research.provider.news = AsyncMock(return_value=([], []))
    return research


def test_profile_round_trip_and_market_facts_unchanged(monkeypatch):
    snapshot = MarketSnapshot(price_usd=10, change_24h_percent=-2, source="Fixture",
        source_url="https://example.com/market", volume_24h_usd=1000, max_supply=100,
        market_cap_usd=1000, fully_diluted_valuation_usd=2000)
    monkeypatch.setattr(service.provider, "snapshot", AsyncMock(return_value=(snapshot, [])))
    monkeypatch.setattr(service.provider, "news", AsyncMock(return_value=([], [])))
    with TestClient(app) as client:
        base = {"asset_id": "bitcoin", "question": "Supply and liquidity"}
        no_profile = client.post("/api/v1/crypto-analysis", json=base).json()
        low = client.post("/api/v1/crypto-analysis", json={**base, "profile": {
            "display_name": "Fin friend", "loss_tolerance": "low", "horizon": "short", "loss_capacity": "low"}}).json()
        high = client.post("/api/v1/crypto-analysis", json={**base, "profile": {
            "experience": "advanced", "loss_tolerance": "high", "loss_capacity": "high", "horizon": "long"}}).json()
    assert no_profile["applied_profile"] is None
    assert no_profile["personalized_notes"] == []
    assert low["applied_profile"]["display_name"] == "Fin friend"
    assert low["personalized_notes"] != high["personalized_notes"]
    assert low["market_snapshot"] == high["market_snapshot"] == no_profile["market_snapshot"]
    assert low["answer"] == high["answer"]
    assert low["pros_cons"] == high["pros_cons"]
    assert "no crypto asset is certified safe" in str(low["personalized_notes"])
    assert "suitable" in str(high["personalized_notes"])


@pytest.mark.parametrize("profile", [
    {"loss_tolerance": "extreme"}, {"loss_capacity": "wealthy"},
    {"display_name": "x" * 41}, {"risk_score": 100}, {"wallet_seed": "no"},
    {"interests": ["equities"]}, {"income": 100000},
])
def test_profile_rejects_unsupported_and_sensitive_fields(profile):
    with pytest.raises(ValidationError):
        ResearchProfile.model_validate(profile)


def test_pros_cons_depend_on_asset_data_not_fixed_list():
    async def run():
        snapshot = MarketSnapshot(price_usd=10, max_supply=100, volume_24h_usd=1000,
            market_cap_usd=1000, fully_diluted_valuation_usd=2000, change_24h_percent=-5,
            source="Fixture", source_url="https://example.com/market")
        research = fixture_service(snapshot)
        btc = await research.analyze(CryptoAnalysisRequest(asset_id="bitcoin", question="Overview"), "one")
        second = MarketSnapshot(price_usd=10, market_cap_usd=1000, fully_diluted_valuation_usd=1000,
            source="Fixture", source_url="https://example.com/other")
        research.provider.snapshot = AsyncMock(return_value=(second, []))
        eth = await research.analyze(CryptoAnalysisRequest(asset_id="ethereum", question="Overview"), "two")
        assert btc.pros_cons != eth.pros_cons
        assert any("100.0000 BTC" in item.detail for item in btc.pros_cons.pros)
        assert any("valuation gap" in item.title.lower() for item in btc.pros_cons.cons)
        assert not eth.pros_cons.cons
        assert any("equal" in item.detail for item in eth.pros_cons.pros)
        source_ids = {source.source_id for source in btc.sources}
        assert all(set(item.source_ids) <= source_ids for item in btc.pros_cons.pros + btc.pros_cons.cons + btc.pros_cons.unknowns)
        assert all(item.source_ids for item in btc.pros_cons.pros + btc.pros_cons.cons)
    asyncio.run(run())


def test_missing_evidence_does_not_force_strengths_or_negatives():
    async def run():
        research = fixture_service(MarketSnapshot())
        response = await research.analyze(CryptoAnalysisRequest(asset_id="bitcoin", question="Risks"), "test")
        assert response.pros_cons.pros == []
        assert response.pros_cons.cons == []
        assert response.pros_cons.unknowns
        assert "No strengths or concerns are invented" in response.pros_cons.unknowns[0].detail
    asyncio.run(run())


def test_unknown_capacity_is_not_replaced_by_high_tolerance():
    async def run():
        research = fixture_service(MarketSnapshot())
        response = await research.analyze(CryptoAnalysisRequest(asset_id="bitcoin", question="Risks",
            profile=ResearchProfile(loss_tolerance="high", loss_capacity="unknown")), "test")
        assert any("ability to absorb losses is unknown" in note.detail for note in response.personalized_notes)
        assert response.applied_profile.loss_capacity == "unknown"
    asyncio.run(run())
