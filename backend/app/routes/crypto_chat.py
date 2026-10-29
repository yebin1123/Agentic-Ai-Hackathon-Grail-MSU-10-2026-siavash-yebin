from fastapi import APIRouter

from app.routes.crypto_analysis import service as research_service
from app.schemas.chat import ChatConfig, ChatRequest, ChatResponse
from app.services.crypto_chat import CryptoChatService


router = APIRouter()
service = CryptoChatService(research_service.provider)


@router.get("/api/v1/chat/config", response_model=ChatConfig)
async def chat_config():
    return service.config()


@router.post("/api/v1/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    return await service.chat(request)
