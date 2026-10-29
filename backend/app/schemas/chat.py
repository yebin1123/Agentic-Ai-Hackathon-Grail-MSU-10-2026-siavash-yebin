"""Bounded hosted-chat input and independently validated model output."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.research_profile import ResearchProfile


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    question: str = Field(min_length=1, max_length=2000)
    asset_id: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{0,79}$")
    profile: ResearchProfile | None = None
    share_profile: bool = False
    messages: list[ChatMessage] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def consent_and_budget(self):
        if self.profile is not None or self.share_profile:
            raise ValueError("Hosted profile sharing is disabled for Gemini free tier. Do not submit sensitive or personal data in questions or history; free-tier content may be used to improve products and reviewed by humans.")
        if sum(len(message.content) for message in self.messages) + len(self.question) > 16000:
            raise ValueError("History and question together must not exceed 16000 characters.")
        return self


class ChatConfig(BaseModel):
    enabled: bool
    provider: Literal["gemini"] = "gemini"
    model: str | None = None
    max_question_chars: Literal[2000] = 2000
    profile_sharing: Literal["disabled_free_tier"] = "disabled_free_tier"


class ChatCitation(BaseModel):
    source_id: str
    title: str
    url: str


class ChatResponse(BaseModel):
    status: Literal["answered", "out_of_scope", "unavailable"]
    answer: str
    citations: list[ChatCitation] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    model: str | None = None
    profile_applied: Literal[False] = False


class ModelAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)
    in_scope: bool
    answer: str = Field(min_length=1, max_length=8000)
    source_ids: list[str] = Field(max_length=6)
    limitations: list[str] = Field(max_length=12)

    @model_validator(mode="after")
    def bounded_strings(self):
        if any(not value or len(value) > 80 for value in self.source_ids):
            raise ValueError("Malformed source ID")
        if any(not value or len(value) > 1000 for value in self.limitations):
            raise ValueError("Malformed limitation")
        return self
