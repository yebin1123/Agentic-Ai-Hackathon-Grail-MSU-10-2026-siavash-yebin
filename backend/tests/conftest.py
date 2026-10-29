"""Prevent accidental external provider or paid model calls in every test."""
import httpx
import pytest


@pytest.fixture(autouse=True)
def block_real_http_transports(monkeypatch):
    def blocked(self, request):
        raise httpx.ConnectError("External network is blocked in tests; use MockTransport.", request=request)

    async def async_blocked(self, request):
        raise httpx.ConnectError("External network is blocked in tests; use MockTransport.", request=request)

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", blocked)
    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", async_blocked)
