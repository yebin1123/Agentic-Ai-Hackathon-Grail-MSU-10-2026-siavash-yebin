from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.research_profile import ContextNote, ProsCons, ResearchProfile


Timeframe = Literal["1d", "1w", "1m", "1y"]


class Asset(BaseModel):
    id: str
    symbol: str
    name: str
    category: str
    platforms: dict[str, str] = Field(default_factory=dict)
    provider_url: str | None = None


class CryptoAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    asset_id: str = Field(min_length=1, max_length=80)
    question: str = Field(min_length=1, max_length=1000)
    profile: ResearchProfile | None = None


class MarketSnapshot(BaseModel):
    price_usd: float | None = None
    change_24h_percent: float | None = None
    market_cap_usd: float | None = None
    fully_diluted_valuation_usd: float | None = None
    volume_24h_usd: float | None = None
    volume_scope: str | None = None
    circulating_supply: float | None = None
    max_supply: float | None = None
    high_24h_usd: float | None = None
    low_24h_usd: float | None = None
    ath_change_percent: float | None = None
    source: str | None = None
    source_url: str | None = None
    as_of: str | None = None
    retrieved_at: str | None = None


class KeyPoint(BaseModel):
    category: str
    title: str
    detail: str


class AnswerSection(BaseModel):
    topic: str
    title: str
    answer: str = Field(min_length=1)
    status: Literal["answered", "limited", "unsupported"]
    limitation: str | None = None


class Risk(BaseModel):
    title: str
    detail: str
    severity: Literal["low", "medium", "high", "unknown"] = "unknown"


class Source(BaseModel):
    title: str
    url: str
    publisher: str
    published_at: str | None = None
    source_type: str
    source_id: str | None = None


class Meta(BaseModel):
    generated_at: str
    data_as_of: str | None = None
    warnings: list[str] = Field(default_factory=list)


class CryptoAnalysisResponse(BaseModel):
    request_id: str
    asset: Asset
    analysis_mode: Literal["deterministic"] = "deterministic"
    submitted_question: str
    answer: str = Field(min_length=1)
    answer_sections: list[AnswerSection] = Field(default_factory=list)
    market_snapshot: MarketSnapshot
    key_points: list[KeyPoint]
    risks: list[Risk]
    sources: list[Source]
    meta: Meta
    applied_profile: ResearchProfile | None = None
    personalized_notes: list[ContextNote] = Field(default_factory=list)
    pros_cons: ProsCons = Field(default_factory=ProsCons)


class PricePoint(BaseModel):
    timestamp: str
    price: float = Field(gt=0, allow_inf_nan=False)


class HistoryResponse(BaseModel):
    asset_id: str
    timeframe: Timeframe
    currency: Literal["USD"] = "USD"
    source: str | None = None
    source_url: str | None = None
    sampling: str | None = None
    points: list[PricePoint] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    retrieved_at: str
    coverage_start: str | None = None
    coverage_end: str | None = None
    period_change_percent: float | None = None
    max_drawdown_percent: float | None = None
