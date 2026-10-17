from __future__ import annotations

import uuid
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.routes.stock_analysis import router as stock_router


app = FastAPI(title="Stock Research Buddy API", version="0.1.0")
app.include_router(stock_router)


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
