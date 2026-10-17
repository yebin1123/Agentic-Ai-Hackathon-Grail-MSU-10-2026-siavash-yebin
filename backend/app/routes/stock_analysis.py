from __future__ import annotations

import uuid
from fastapi import APIRouter, HTTPException

from app.schemas.stock_analysis import StockAnalysisRequest, StockAnalysisResponse
from app.services.research_buddy import ResearchBuddyService


router = APIRouter()
service = ResearchBuddyService()


@router.get("/api/v1/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/api/v1/stock-analysis", response_model=StockAnalysisResponse)
async def analyze_stock(request: StockAnalysisRequest) -> StockAnalysisResponse:
    request_id = str(uuid.uuid4())

    if not service.provider.is_valid_ticker(request.ticker):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_TICKER",
                "message": "The ticker could not be validated.",
                "request_id": request_id,
            },
        )

    result = service.analyze(request, request_id=request_id)
    return result
