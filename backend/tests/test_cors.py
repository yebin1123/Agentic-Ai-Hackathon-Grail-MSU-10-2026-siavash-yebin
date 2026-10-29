from fastapi.testclient import TestClient

from app.main import app, frontend_origins


def test_frontend_origins_are_trimmed_and_blanks_dropped(monkeypatch):
    monkeypatch.setenv("FRONTEND_ORIGINS", " https://a.test , ,https://b.test ")
    assert frontend_origins() == ["https://a.test", "https://b.test"]


def test_frontend_origins_default(monkeypatch):
    monkeypatch.delenv("FRONTEND_ORIGINS", raising=False)
    assert frontend_origins() == ["http://localhost:5173", "http://127.0.0.1:5173"]


def preflight(headers: str):
    with TestClient(app) as client:
        return client.options(
            "/api/v1/crypto-analysis",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": headers,
            },
        )


def test_preflight_allows_content_type():
    response = preflight("content-type")
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_preflight_rejects_unlisted_headers():
    assert preflight("x-custom-header").status_code == 400
