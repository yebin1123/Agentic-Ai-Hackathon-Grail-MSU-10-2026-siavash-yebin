from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StockAnalysisRequest(BaseModel):
    ticker: str = Field(..., description="Ticker symbol like NVDA or BTC")
    question: str = Field(..., description="Research question to answer")

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Ticker is required.")
        return cleaned.upper()

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Question is required.")
        if len(cleaned) > 1000:
            raise ValueError("Question must be 1,000 characters or fewer.")
        return cleaned


class MarketSnapshot(BaseModel):
    model_config = ConfigDict(extra="allow")

    price: float | None = None
    currency: str | None = None
    change_percent: float | None = None
    as_of: str | None = None
    source: str | None = None
    market_cap_usd: float | None = None
    volume_24h_usd: float | None = None
    volatility_24h: float | None = None
    asset_type: str | None = None
    history: list[dict[str, Any]] = []


class KeyPoint(BaseModel):
    category: str = "other"
    title: str
    detail: str


class Risk(BaseModel):
    title: str
    detail: str
    severity: Literal["low", "medium", "high", "unknown"] = "unknown"


class Source(BaseModel):
    title: str
    url: str
    publisher: str
    published_at: str | None = None
    source_type: str = "news"


class Meta(BaseModel):
    generated_at: str
    data_as_of: str | None = None
    warnings: list[str] = []


class StockAnalysisResponse(BaseModel):
    request_id: str
    ticker: str
    company_name: str | None = None
    answer: str
    market_snapshot: MarketSnapshot | None
    key_points: list[KeyPoint] = []
    risks: list[Risk] = []
    sources: list[Source] = []
    meta: Meta


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorDetail