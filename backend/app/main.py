from __future__ import annotations

import uuid
import os
import logging
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes.crypto_analysis import router, service
from app.routes.crypto_chat import router as chat_router, service as chat_service


@asynccontextmanager
async def lifespan(app):
    async with httpx.AsyncClient(timeout=3, headers={"User-Agent": "FinCryptoResearch/0.2"}, limits=httpx.Limits(max_connections=20, max_keepalive_connections=10)) as client:
        async with httpx.AsyncClient(timeout=chat_service.model_timeout, limits=httpx.Limits(max_connections=2, max_keepalive_connections=2)) as model_client:
            service.provider.client = client
            chat_service.model_client = model_client
            try:
                yield
            finally:
                chat_service.model_client = None
                service.provider.client = None


def frontend_origins() -> list[str]:
    raw = os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(title="Fin Crypto Research API", version="0.5.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(router)
app.include_router(chat_router)


@app.exception_handler(Exception)
async def unexpected_exception_handler(_: Request, exc: Exception):
    logging.getLogger(__name__).error("Unhandled backend error", exc_info=exc)
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred. Please retry.", "request_id": str(uuid.uuid4())}})


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "INVALID_REQUEST",
                "message": "The request payload is invalid.",
                "request_id": str(uuid.uuid4()),
            }
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    payload: Any = exc.detail
    if isinstance(payload, dict):
        error_payload = payload.copy()
    else:
        error_payload = {
            "code": "INVALID_REQUEST",
            "message": str(payload),
            "request_id": str(uuid.uuid4()),
        }

    if "request_id" not in error_payload:
        error_payload["request_id"] = str(uuid.uuid4())

    return JSONResponse(status_code=exc.status_code, content={"error": error_payload})
