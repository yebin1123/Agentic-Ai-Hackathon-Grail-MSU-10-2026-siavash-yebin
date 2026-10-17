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
