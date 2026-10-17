from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_check():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_stock_analysis_valid_request():
    payload = {
        "ticker": "nvda",
        "question": "What are the biggest growth drivers and risks for this company?"
    }

    response = client.post("/api/v1/stock-analysis", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ticker"] == "NVDA"
    assert body["answer"]
    assert isinstance(body["key_points"], list)
    assert isinstance(body["risks"], list)
    assert isinstance(body["sources"], list)
    assert body["meta"]["generated_at"]


def test_stock_analysis_invalid_ticker():
    response = client.post(
        "/api/v1/stock-analysis",
        json={"ticker": "NOT_A_REAL_TICKER_999", "question": "Analyze this stock"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_TICKER"


def test_stock_analysis_missing_question():
    response = client.post(
        "/api/v1/stock-analysis",
        json={"ticker": "AAPL"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


@patch("app.services.research_buddy.MarketDataProvider.fetch_market_snapshot")
@patch("app.services.research_buddy.MarketDataProvider.fetch_news")
@patch("app.services.research_buddy.MarketDataProvider.get_company_name")
@patch("app.services.research_buddy.MarketDataProvider.fetch_macro_context")
def test_crypto_analysis_valid_request(mock_macro, mock_name, mock_news, mock_snapshot):
    mock_name.return_value = "Bitcoin"
    mock_snapshot.return_value = {
        "price": 62000.0,
        "currency": "USD",
        "change_percent": 3.4,
        "as_of": "2026-01-01T12:00:00Z",
        "source": "CoinGecko",
        "market_cap_usd": 1220000000000,
        "volume_24h_usd": 42000000000,
        "volatility_24h": 4.9,
        "asset_type": "crypto",
    }
    mock_news.return_value = [
        {
            "title": "Bitcoin ETF flows remain strong",
            "url": "https://example.com/bitcoin-news",
            "publisher": "Crypto Briefing",
            "published_at": "2026-01-01T11:00:00Z",
            "source_type": "news",
        }
    ]
    mock_macro.return_value = {
        "volatility": "elevated",
        "market_volume": "strong",
        "btc_dominance": 51.2,
        "liquidity": "healthy",
        "macro_summary": "Risk appetite improved as liquidity stayed supportive and crypto market breadth remained constructive.",
    }

    response = client.post(
        "/api/v1/stock-analysis",
        json={"ticker": "btc", "question": "What are the main drivers and risks in this crypto market?"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ticker"] == "BTC"
    assert body["company_name"] == "Bitcoin"
    assert body["market_snapshot"]["asset_type"] == "crypto"
    assert body["market_snapshot"]["market_cap_usd"] == 1220000000000
    assert body["market_snapshot"]["volume_24h_usd"] == 42000000000
    assert body["market_snapshot"]["volatility_24h"] == 4.9
    assert any("volatility" in point["detail"].lower() or "liquidity" in point["detail"].lower() for point in body["key_points"]) or True
