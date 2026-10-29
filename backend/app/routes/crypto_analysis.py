import asyncio
import uuid

from fastapi import APIRouter, HTTPException, Query

from app.schemas.crypto_analysis import CryptoAnalysisRequest, CryptoAnalysisResponse, HistoryResponse, Timeframe
from app.services.crypto_research import CryptoResearchService
from app.tools.crypto_data import ASSETS, AssetResolutionUnavailable, ProviderUnavailable, UnknownAsset, get_asset

router = APIRouter()
service = CryptoResearchService()


def asset_error(exc):
    if isinstance(exc, UnknownAsset):
        return HTTPException(400, detail={"code": "UNKNOWN_ASSET", "message": str(exc)})
    code = "ASSET_RESOLUTION_UNAVAILABLE" if isinstance(exc, AssetResolutionUnavailable) else "PROVIDER_UNAVAILABLE"
    return HTTPException(503, detail={"code": code, "message": str(exc)})


@router.get("/api/v1/health")
async def health():
    return {"status": "ok"}


@router.get("/api/v1/assets")
async def assets():
    return {"assets": [get_asset(asset_id) for asset_id in ASSETS]}


@router.get("/api/v1/assets/search")
async def search_assets(q: str = Query(min_length=2, max_length=100)):
    try:
        return await service.provider.search_assets(q)
    except ProviderUnavailable as exc:
        raise asset_error(exc) from exc
    except ValueError as exc:
        raise HTTPException(400, detail={"code": "INVALID_REQUEST", "message": str(exc)}) from exc


@router.get("/api/v1/assets/{asset_id}")
async def asset_detail(asset_id: str):
    try:
        return {"asset": await service.provider.resolve_asset(asset_id, full_metadata=True)}
    except (UnknownAsset, ProviderUnavailable) as exc:
        raise asset_error(exc) from exc


@router.post("/api/v1/crypto-analysis", response_model=CryptoAnalysisResponse)
async def analyze(request: CryptoAnalysisRequest):
    async def retrieve():
        await service.provider.resolve_asset(request.asset_id)
        return await service.analyze(request, str(uuid.uuid4()))

    try:
        return await asyncio.wait_for(retrieve(), timeout=14)
    except (UnknownAsset, ProviderUnavailable) as exc:
        raise asset_error(exc) from exc
    except TimeoutError:
        raise HTTPException(503, detail={"code": "RETRIEVAL_TIMEOUT", "message": "Crypto providers took too long. Please retry shortly."})


@router.get("/api/v1/crypto-history/{asset_id}", response_model=HistoryResponse)
async def history(asset_id: str, timeframe: Timeframe = "1m"):
    try:
        return await asyncio.wait_for(service.provider.history(asset_id, timeframe), timeout=14)
    except (UnknownAsset, ProviderUnavailable) as exc:
        raise asset_error(exc) from exc
    except TimeoutError:
        raise HTTPException(503, detail={"code": "RETRIEVAL_TIMEOUT", "message": "Chart providers took too long. Please retry shortly."})


@router.post("/api/v1/stock-analysis", include_in_schema=False)
async def retired_stock_endpoint():
    raise HTTPException(410, detail={"code": "ENDPOINT_RETIRED", "message": "This app is now crypto-only. Use /api/v1/crypto-analysis."})
