"""Optional qualitative research context, not a suitability assessment."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ResearchProfile(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    display_name: str = Field(default="", max_length=40)
    experience: Literal["beginner", "intermediate", "advanced"] = "beginner"
    goal: Literal["learn", "long_term_research", "trading_risk"] = "learn"
    horizon: Literal["short", "medium", "long"] = "long"
    loss_tolerance: Literal["low", "medium", "high"] = "low"
    loss_capacity: Literal["low", "medium", "high", "unknown"] = "unknown"
    liquidity_need: Literal["soon", "flexible", "unknown"] = "unknown"
    explanation: Literal["concise", "detailed"] = "concise"
    interests: list[Literal["defi", "infrastructure", "security", "payments", "stablecoins", "memecoins"]] = Field(default_factory=list, max_length=6)


class ContextNote(BaseModel):
    title: str
    detail: str


class Argument(BaseModel):
    title: str
    detail: str
    source_ids: list[str] = Field(default_factory=list)
    interpretation: bool = True


class ProsCons(BaseModel):
    pros: list[Argument] = Field(default_factory=list)
    cons: list[Argument] = Field(default_factory=list)
    unknowns: list[Argument] = Field(default_factory=list)
